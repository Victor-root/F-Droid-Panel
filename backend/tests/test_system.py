from __future__ import annotations

import time

from .conftest import Api


def test_system_reports_a_missing_fdroidserver(admin: Api) -> None:
    system = admin.get("/system").json()
    assert system["fdroid"]["error"] == "not_found"
    assert system["fdroid"]["supported"] is False
    assert system["selfTest"] is None


def test_self_test_runs_from_a_request(admin: Api) -> None:
    job_id = admin.post("/system/self-test").json()["jobId"]
    for _ in range(50):
        job = admin.get(f"/jobs/{job_id}").json()
        if job["finishedAt"]:
            break
        time.sleep(0.05)
    assert job["status"] == "failed"
    assert job["error"]["code"] == "fdroid_not_found"
    assert admin.get("/system").json()["selfTest"]["id"] == job_id
