from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from fdroid_panel.db import Database, create_database_engine, migrate
from fdroid_panel.jobs import JobContext, JobFailed, JobRunner, minimal_environment
from fdroid_panel.models import Job, JobStatus

from .conftest import Api


@pytest.fixture
def runner(tmp_path: Path) -> JobRunner:
    engine = create_database_engine(tmp_path / "jobs.db")
    migrate(engine)
    (tmp_path / "logs").mkdir()
    return JobRunner(Database(engine), tmp_path / "logs")


def status_of(runner: JobRunner, job_id: int) -> Job:
    with runner.database.session() as db:
        job = db.get(Job, job_id)
        assert job is not None
        return job


def test_runs_commands_and_keeps_the_log(runner: JobRunner, tmp_path: Path) -> None:
    async def work(context: JobContext) -> dict[str, object]:
        result = await context.run(
            ["sh", "-c", "echo hello; echo secret-value"], cwd=tmp_path, env=minimal_environment(tmp_path)
        )
        return {"lines": len(result.output)}

    async def scenario() -> int:
        job_id = runner.submit(kind="test", function=work, secrets=["secret-value"])
        await runner.wait_idle()
        return job_id

    job_id = asyncio.run(scenario())
    job = status_of(runner, job_id)
    assert job.status == JobStatus.SUCCEEDED
    assert job.result == {"lines": 2}
    assert runner.read_log(job_id) == ["$ sh -c echo hello; echo ********", "hello", "********"]


def test_failures_keep_a_code(runner: JobRunner, tmp_path: Path) -> None:
    async def failing(context: JobContext) -> None:
        await context.run(["sh", "-c", "exit 3"], cwd=tmp_path, env=minimal_environment(tmp_path))

    async def explicit(context: JobContext) -> None:
        raise JobFailed("nothing_to_publish", count=0)

    async def scenario() -> tuple[int, int]:
        first = runner.submit(kind="test", function=failing)
        second = runner.submit(kind="test", function=explicit)
        await runner.wait_idle()
        return first, second

    first, second = asyncio.run(scenario())
    assert status_of(runner, first).error == {
        "code": "command_failed",
        "params": {"command": "sh", "exit_code": 3},
    }
    assert status_of(runner, second).error == {"code": "nothing_to_publish", "params": {"count": 0}}


def test_jobs_of_one_repository_never_overlap(runner: JobRunner, tmp_path: Path) -> None:
    events: list[str] = []

    def make(name: str) -> object:
        async def work(context: JobContext) -> None:
            events.append(f"{name}-start")
            await asyncio.sleep(0.05)
            events.append(f"{name}-end")

        return work

    async def scenario() -> None:
        runner.submit(kind="test", function=make("a"), repository_id=None, lock_path=tmp_path)  # type: ignore[arg-type]
        runner.submit(kind="test", function=make("b"), repository_id=None, lock_path=tmp_path)  # type: ignore[arg-type]
        await runner.wait_idle()

    asyncio.run(scenario())
    assert events == ["a-start", "a-end", "b-start", "b-end"]


def test_follow_streams_existing_and_new_lines(runner: JobRunner) -> None:
    release = asyncio.Event()

    async def work(context: JobContext) -> None:
        context.log("first")
        await release.wait()
        context.log("second")

    async def scenario() -> list[str]:
        job_id = runner.submit(kind="test", function=work)
        await asyncio.sleep(0.01)
        received: list[str] = []

        async def collect() -> None:
            async for line in runner.follow(job_id):
                received.append(line)

        task = asyncio.create_task(collect())
        await asyncio.sleep(0.01)
        release.set()
        await asyncio.wait_for(task, 2)
        return received

    assert asyncio.run(scenario()) == ["first", "second"]


def test_interrupted_jobs_are_marked_on_start(runner: JobRunner) -> None:
    with runner.database.session() as db:
        job = Job(kind="test", status=JobStatus.RUNNING)
        db.add(job)
        db.commit()
        job_id = job.id
    runner.recover()
    assert status_of(runner, job_id).status == JobStatus.INTERRUPTED


def test_jobs_api_lists_and_streams(admin: Api, client: object) -> None:
    from fastapi.testclient import TestClient

    assert isinstance(client, TestClient)
    runner: JobRunner = client.app.state.jobs  # type: ignore[attr-defined]

    async def work(context: JobContext) -> None:
        context.log("done")

    async def submit() -> int:
        job_id = runner.submit(kind="test", function=work)
        await runner.wait_idle()
        return job_id

    job_id = client.portal.call(submit)  # type: ignore[union-attr]
    page = admin.get("/jobs").json()
    assert page["total"] == 1 and page["items"][0]["status"] == "succeeded"
    assert admin.get(f"/jobs/{job_id}/log").json() == ["done"]
    stream = admin.get(f"/jobs/{job_id}/stream")
    assert stream.text == "event: line\ndata: done\n\nevent: end\ndata: \n\n"
