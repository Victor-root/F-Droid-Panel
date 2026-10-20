from __future__ import annotations

import json
import time
from pathlib import Path

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


def test_maintenance_requests_go_to_the_helper(admin: Api) -> None:
    assert admin.get("/system/maintenance").json() == {"available": False, "installed": None, "latest": None}
    assert admin.post("/system/maintenance", {"action": "check"}).json()["error"]["code"] == (
        "maintenance_unavailable"
    )

    directory: Path = admin.state.settings.maintenance_dir
    (directory / "requests").mkdir(parents=True)
    (directory / "results").mkdir()
    (directory / "helper.json").write_text(json.dumps({"version": "0.1.0", "channel": "edge", "commit": "a"}))
    (directory / "latest.json").write_text(json.dumps({"version": "0.1.0", "commit": "b"}))
    info = admin.get("/system/maintenance").json()
    assert info["installed"]["channel"] == "edge" and info["latest"]["newer"] is True
    (directory / "latest.json").write_text(json.dumps({"version": "0.1.0", "commit": "a"}))
    assert admin.get("/system/maintenance").json()["latest"]["newer"] is False

    request_id = admin.post("/system/maintenance", {"action": "check"}).json()["id"]
    assert json.loads((directory / "requests" / f"{request_id}.json").read_text()) == {"action": "check"}
    assert admin.get(f"/system/maintenance/{request_id}").json()["state"] == "waiting"

    (directory / "results" / f"{request_id}.json").write_text(json.dumps({"state": "succeeded"}))
    (directory / "results" / f"{request_id}.log").write_text("Checking\nUp to date\n")
    state = admin.get(f"/system/maintenance/{request_id}").json()
    assert state == {"state": "succeeded", "code": None, "params": {}, "log": ["Checking", "Up to date"]}
    assert admin.get("/system/maintenance/../../etc").status_code == 404

    refused = admin.post("/system/maintenance", {"action": "grant", "path": "relative/path"})
    assert refused.json()["error"]["code"] == "path_not_absolute"
