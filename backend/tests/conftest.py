from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pyotp
import pytest
from fastapi.testclient import TestClient

from fdroid_panel.app import create_app
from fdroid_panel.cli import create_setup_code
from fdroid_panel.config import Settings
from fdroid_panel.db import Database

ADMIN_PASSWORD = "correct horse battery"


class Api:
    """A browser-like client: sends the client header and the CSRF token like the interface does."""

    def __init__(self, client: TestClient) -> None:
        self.client = client
        self.csrf = ""

    def _headers(self) -> dict[str, str]:
        return {"X-Requested-With": "fdroid-panel", "X-CSRF-Token": self.csrf}

    def get(self, path: str, **kwargs: Any) -> Any:
        return self.client.get(f"/admin/api{path}", headers=self._headers(), **kwargs)

    def post(self, path: str, json: Any = None, **kwargs: Any) -> Any:
        return self.client.post(f"/admin/api{path}", json=json, headers=self._headers(), **kwargs)

    def patch(self, path: str, json: Any = None) -> Any:
        return self.client.patch(f"/admin/api{path}", json=json, headers=self._headers())

    def put(self, path: str, json: Any = None) -> Any:
        return self.client.put(f"/admin/api{path}", json=json, headers=self._headers())

    def delete(self, path: str) -> Any:
        return self.client.delete(f"/admin/api{path}", headers=self._headers())

    def refresh_csrf(self) -> None:
        response = self.get("/me")
        assert response.status_code == 200, response.text
        self.csrf = response.json()["csrfToken"]

    def login(self, username: str, password: str, totp_secret: str | None = None) -> None:
        self.csrf = ""
        response = self.post("/auth/login", {"username": username, "password": password})
        assert response.status_code == 200, response.text
        if totp_secret:
            response = self.post("/auth/second-factor", {"code": pyotp.TOTP(totp_secret).now()})
            assert response.status_code == 200, response.text
        self.refresh_csrf()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path / "data",
        secrets_dir=tmp_path / "secrets",
        maintenance_dir=tmp_path / "maintenance",
        fdroid_command="fdroid-panel-test-missing-fdroid",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def database(client: TestClient) -> Database:
    database: Database = client.app.state.database  # type: ignore[attr-defined]
    return database


@pytest.fixture
def api(client: TestClient) -> Api:
    return Api(client)


@pytest.fixture
def admin(api: Api, database: Database) -> Api:
    """An API client logged in as the first administrator."""
    code = create_setup_code(database)
    response = api.post(
        "/auth/setup", {"code": code, "username": "admin", "displayName": "Admin", "password": ADMIN_PASSWORD}
    )
    assert response.status_code == 200, response.text
    api.refresh_csrf()
    return api
