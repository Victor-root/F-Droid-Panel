"""Everything that runs the fdroid command line tool."""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import tempfile
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any

from .jobs import JobContext, JobFailed, JobFunction, minimal_environment

MIN_VERSION = (2, 4, 0)
SELF_TEST_PACKAGE = "org.fdroidpanel.selftest"
VERSION_TIMEOUT = 60


def parse_version(text: str) -> tuple[int, ...] | None:
    match = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", text)
    if match is None:
        return None
    return tuple(int(part) for part in match.groups(default="0"))


@dataclass(frozen=True)
class FdroidInfo:
    command: str
    version: str | None
    error: str | None

    @property
    def supported(self) -> bool:
        parsed = parse_version(self.version or "")
        return parsed is not None and parsed >= MIN_VERSION


async def probe(command: str, home: Path) -> FdroidInfo:
    """Runs `fdroid --version`; a missing or broken installation is reported, never raised."""
    if shutil.which(command) is None:
        return FdroidInfo(command, None, "not_found")
    try:
        process = await asyncio.create_subprocess_exec(
            command,
            "--version",
            env=minimal_environment(home),
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        output, _ = await asyncio.wait_for(process.communicate(), VERSION_TIMEOUT)
    except (OSError, asyncio.TimeoutError):
        return FdroidInfo(command, None, "not_runnable")
    lines = output.decode(errors="replace").strip().splitlines()
    if process.returncode != 0 or not lines:
        return FdroidInfo(command, None, "not_runnable")
    version = lines[-1].strip()
    return FdroidInfo(command, version if parse_version(version) else None, None)


def indexed_versions(index_v2: Path) -> dict[str, list[int]]:
    data: dict[str, Any] = json.loads(index_v2.read_text(encoding="utf-8"))
    return {
        package: sorted(version["manifest"]["versionCode"] for version in details["versions"].values())
        for package, details in data.get("packages", {}).items()
    }


def self_test(command: str, home: Path, work_dir: Path) -> JobFunction:
    """A job that builds a throwaway repository with a bundled APK and checks that it gets published."""

    async def run(context: JobContext) -> dict[str, Any]:
        info = await probe(command, home)
        context.log(f"fdroid: {command} ({info.version or info.error})")
        if info.error is not None:
            raise JobFailed(f"fdroid_{info.error}", command=command)
        work_dir.mkdir(parents=True, exist_ok=True)
        environment = minimal_environment(home)
        with tempfile.TemporaryDirectory(dir=work_dir, prefix="self-test-") as temporary:
            repository = Path(temporary)
            await context.run(
                [
                    command,
                    "init",
                    "--no-prompt",
                    "--repo-keyalias",
                    "selftest",
                    "-d",
                    "CN=F-Droid Panel self-test",
                ],
                cwd=repository,
                env=environment,
            )
            apk = resources.files("fdroid_panel") / "data" / "selftest.apk"
            (repository / "repo" / "selftest.apk").write_bytes(apk.read_bytes())
            # fdroidserver ignores an APK without a metadata file.
            (repository / "metadata").mkdir()
            (repository / "metadata" / f"{SELF_TEST_PACKAGE}.yml").write_text(
                "License: MIT\n", encoding="utf-8"
            )
            await context.run([command, "update"], cwd=repository, env=environment)
            index = repository / "repo" / "index-v2.json"
            if not index.exists() or SELF_TEST_PACKAGE not in indexed_versions(index):
                raise JobFailed("self_test_not_published")
        context.log("The test APK was published: this fdroidserver works.")
        return {"command": command, "version": info.version, "supported": info.supported}

    return run
