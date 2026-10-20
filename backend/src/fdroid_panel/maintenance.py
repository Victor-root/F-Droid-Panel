"""Requests to the maintenance helper, the root part of install.sh (ARCHITECTURE 7.5).

The panel writes requests/<id>.json; a systemd path unit starts the helper, which handles it and
writes results/<id>.json and results/<id>.log. The helper also keeps helper.json (what is installed)
and latest.json (the last update check). Without the helper (development, containers), nothing here
is available.
"""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .files import write_atomic

ACTIONS = ("check", "update", "update-fdroidserver", "grant")
REQUEST_ID = re.compile(r"^[0-9a-f]{32}$")
LOG_LINES = 500


@dataclass
class RequestState:
    # waiting (not picked up yet), running, succeeded or failed.
    state: str
    code: str | None
    params: dict[str, Any]
    log: list[str]


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


class Maintenance:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    @property
    def available(self) -> bool:
        return (self.directory / "helper.json").is_file() and (self.directory / "requests").is_dir()

    def installed(self) -> dict[str, Any] | None:
        return _read_json(self.directory / "helper.json")

    def latest(self) -> dict[str, Any] | None:
        return _read_json(self.directory / "latest.json")

    def request(self, action: str, path: str | None = None) -> str:
        if action not in ACTIONS:
            raise ValueError(action)
        request_id = uuid.uuid4().hex
        body: dict[str, str] = {"action": action}
        if path is not None:
            body["path"] = path
        write_atomic(
            self.directory / "requests" / f"{request_id}.json", json.dumps(body).encode("utf-8"), mode=0o600
        )
        return request_id

    def state(self, request_id: str) -> RequestState | None:
        if not REQUEST_ID.fullmatch(request_id):
            return None
        results = self.directory / "results"
        result = _read_json(results / f"{request_id}.json")
        if result is None:
            if (self.directory / "requests" / f"{request_id}.json").exists():
                return RequestState(state="waiting", code=None, params={}, log=[])
            return None
        try:
            log = (results / f"{request_id}.log").read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            log = []
        return RequestState(
            state=str(result.get("state", "running")),
            code=result.get("code"),
            params=result.get("params") or {},
            log=log[-LOG_LINES:],
        )
