"""Tests against a real fdroidserver; set FDROID_PANEL_TEST_FDROID to the fdroid command to run them."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from fdroid_panel.db import Database, create_database_engine, migrate
from fdroid_panel.fdroid import parse_version, probe, self_test
from fdroid_panel.jobs import JobRunner
from fdroid_panel.models import Job, JobStatus

FDROID = os.environ.get("FDROID_PANEL_TEST_FDROID")
needs_fdroid = pytest.mark.skipif(not FDROID, reason="FDROID_PANEL_TEST_FDROID is not set")


def test_parse_version() -> None:
    assert parse_version("2.4.5") == (2, 4, 5)
    assert parse_version("2.3a1") == (2, 3, 0)
    assert parse_version("unknown") is None


def test_probe_reports_a_missing_command(tmp_path: Path) -> None:
    info = asyncio.run(probe("fdroid-panel-test-missing-fdroid", tmp_path))
    assert info.error == "not_found" and not info.supported


@needs_fdroid
def test_self_test_publishes_the_bundled_apk(tmp_path: Path) -> None:
    assert FDROID
    engine = create_database_engine(tmp_path / "db.sqlite")
    migrate(engine)
    (tmp_path / "logs").mkdir()
    (tmp_path / "home").mkdir()
    runner = JobRunner(Database(engine), tmp_path / "logs")

    async def scenario() -> int:
        job_id = runner.submit(
            kind="self_test", function=self_test(FDROID, tmp_path / "home", tmp_path / "work")
        )
        await runner.wait_idle()
        return job_id

    job_id = asyncio.run(scenario())
    with runner.database.session() as db:
        job = db.get(Job, job_id)
        assert job is not None
        assert job.status == JobStatus.SUCCEEDED, runner.read_log(job_id)
        assert job.result is not None and job.result["supported"] is True
    assert not any((tmp_path / "work").iterdir())
