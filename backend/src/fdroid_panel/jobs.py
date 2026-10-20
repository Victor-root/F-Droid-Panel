"""Background jobs: one sequential queue per repository, persisted state, live logs.

Every operation that touches a repository runs here, so two operations never
modify the same repository at the same time, and every run leaves a full log.
"""

from __future__ import annotations

import asyncio
import fcntl
import logging
import os
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any

from sqlalchemy import update

from .db import Database
from .models import Job, JobStatus, utcnow

logger = logging.getLogger(__name__)

DEFAULT_COMMAND_TIMEOUT = 30 * 60
LOCK_FILE = ".fdroid-panel.lock"
REDACTED = "********"


class JobFailed(Exception):
    """A failure with a stable code the interface can explain."""

    def __init__(self, code: str, **params: Any) -> None:
        super().__init__(code)
        self.code = code
        self.params = params


@dataclass
class CommandResult:
    returncode: int
    output: list[str]


@dataclass
class LogLine:
    index: int
    text: str


JobFunction = Callable[["JobContext"], Awaitable[dict[str, Any] | None]]


@dataclass
class JobContext:
    job_id: int
    runner: JobRunner
    secrets: list[str] = field(default_factory=list)

    def log(self, text: str) -> None:
        for secret in self.secrets:
            if secret:
                text = text.replace(secret, REDACTED)
        self.runner._append(self.job_id, text)

    async def run(
        self,
        args: list[str],
        *,
        cwd: Path,
        env: dict[str, str],
        timeout: float = DEFAULT_COMMAND_TIMEOUT,
        check: bool = True,
    ) -> CommandResult:
        self.log(f"$ {' '.join(args)}")
        process = await asyncio.create_subprocess_exec(
            *args,
            cwd=cwd,
            env=env,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout = process.stdout
        if stdout is None:
            raise RuntimeError("missing stdout pipe")
        output: list[str] = []

        async def pump() -> None:
            async for raw in stdout:
                line = raw.decode(errors="replace").rstrip()
                output.append(line)
                self.log(line)

        try:
            await asyncio.wait_for(asyncio.gather(pump(), process.wait()), timeout)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise JobFailed("command_timeout", command=args[0], minutes=int(timeout // 60)) from None
        returncode = process.returncode or 0
        if check and returncode != 0:
            raise JobFailed("command_failed", command=Path(args[0]).name, exit_code=returncode)
        return CommandResult(returncode=returncode, output=output)


@dataclass
class _Pending:
    job_id: int
    function: JobFunction
    lock_path: Path | None
    secrets: list[str]


def _acquire_lock(directory: Path) -> IO[str]:
    """Blocks until no other job (of this or another panel process) holds the directory."""
    handle = (directory / LOCK_FILE).open("a")
    fcntl.flock(handle, fcntl.LOCK_EX)
    return handle


def _release_lock(handle: IO[str]) -> None:
    fcntl.flock(handle, fcntl.LOCK_UN)
    handle.close()


class JobRunner:
    def __init__(self, database: Database, jobs_dir: Path) -> None:
        self.database = database
        self.jobs_dir = jobs_dir
        self._queues: dict[str, asyncio.Queue[_Pending]] = {}
        self._workers: dict[str, asyncio.Task[None]] = {}
        self._subscribers: dict[int, set[asyncio.Queue[LogLine | None]]] = {}
        self._line_counts: dict[int, int] = {}
        self._active: set[int] = set()

    def recover(self) -> None:
        """Jobs that were queued or running when the service stopped did not finish."""
        with self.database.session() as db:
            db.execute(
                update(Job)
                .where(Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))
                .values(
                    status=JobStatus.INTERRUPTED,
                    finished_at=utcnow(),
                    error={"code": "interrupted", "params": {}},
                )
            )
            db.commit()

    def submit(
        self,
        *,
        kind: str,
        function: JobFunction,
        repository_id: int | None = None,
        user_id: int | None = None,
        lock_path: Path | None = None,
        secrets: list[str] | None = None,
    ) -> int:
        with self.database.session() as db:
            job = Job(kind=kind, status=JobStatus.QUEUED, repository_id=repository_id, created_by=user_id)
            db.add(job)
            db.commit()
            job_id = job.id
        self._active.add(job_id)
        key = f"repository-{repository_id}" if repository_id is not None else "system"
        queue = self._queues.setdefault(key, asyncio.Queue())
        queue.put_nowait(_Pending(job_id, function, lock_path, secrets or []))
        if key not in self._workers or self._workers[key].done():
            self._workers[key] = asyncio.create_task(self._work(key, queue))
        return job_id

    async def _work(self, key: str, queue: asyncio.Queue[_Pending]) -> None:
        while not queue.empty():
            pending = queue.get_nowait()
            await self._execute(pending)
        self._workers.pop(key, None)

    async def _execute(self, pending: _Pending) -> None:
        job_id = pending.job_id
        self._set(job_id, status=JobStatus.RUNNING, started_at=utcnow())
        context = JobContext(job_id=job_id, runner=self, secrets=pending.secrets)
        status, result, error = JobStatus.SUCCEEDED, None, None
        lock = await asyncio.to_thread(_acquire_lock, pending.lock_path) if pending.lock_path else None
        try:
            result = await pending.function(context)
        except JobFailed as failure:
            status, error = JobStatus.FAILED, {"code": failure.code, "params": failure.params}
            context.log(f"Failed: {failure.code} {failure.params}")
        except Exception as exception:
            logger.exception("Job %s crashed", job_id)
            status, error = JobStatus.FAILED, {"code": "internal_error", "params": {}}
            context.log(f"Internal error: {type(exception).__name__}: {exception}")
        finally:
            if lock is not None:
                _release_lock(lock)
        self._set(job_id, status=status, finished_at=utcnow(), result=result, error=error)
        for subscriber in self._subscribers.pop(job_id, set()):
            subscriber.put_nowait(None)
        self._line_counts.pop(job_id, None)
        self._active.discard(job_id)

    def _set(self, job_id: int, **values: Any) -> None:
        with self.database.session() as db:
            db.execute(update(Job).where(Job.id == job_id).values(**values))
            db.commit()

    def log_path(self, job_id: int) -> Path:
        return self.jobs_dir / f"{job_id}.log"

    def _append(self, job_id: int, text: str) -> None:
        index = self._line_counts.get(job_id, 0)
        self._line_counts[job_id] = index + 1
        with self.log_path(job_id).open("a", encoding="utf-8") as handle:
            handle.write(text + "\n")
        for subscriber in self._subscribers.get(job_id, set()):
            subscriber.put_nowait(LogLine(index, text))

    def read_log(self, job_id: int) -> list[str]:
        path = self.log_path(job_id)
        return path.read_text(encoding="utf-8").splitlines() if path.exists() else []

    def is_active(self, job_id: int) -> bool:
        return job_id in self._active

    async def follow(self, job_id: int) -> AsyncIterator[str]:
        """Yields the log written so far, then new lines until the job ends."""
        queue: asyncio.Queue[LogLine | None] = asyncio.Queue()
        self._subscribers.setdefault(job_id, set()).add(queue)
        try:
            existing = self.read_log(job_id)
            for line in existing:
                yield line
            if not self.is_active(job_id):
                return
            while (item := await queue.get()) is not None:
                if item.index >= len(existing):
                    yield item.text
        finally:
            subscribers = self._subscribers.get(job_id)
            if subscribers is not None:
                subscribers.discard(queue)

    async def wait_idle(self) -> None:
        while self._workers:
            await asyncio.gather(*list(self._workers.values()), return_exceptions=True)


def minimal_environment(home: Path, extra: dict[str, str] | None = None) -> dict[str, str]:
    """The environment of every command: nothing inherited but PATH and the locale."""
    environment = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
    }
    environment.update(extra or {})
    return environment
