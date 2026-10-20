from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from fdroid_panel import yamlfile
from fdroid_panel.cli import detach_repositories, list_users, reset_password
from fdroid_panel.db import Database

from .conftest import Api, needs_fdroid


def test_reset_password_unlocks_the_account(admin: Api, database: Database) -> None:
    admin.post("/auth/logout")
    for _ in range(5):
        admin.post("/auth/login", {"username": "admin", "password": "nope nope nope"})
    assert list_users(database) == ["admin admin"]
    assert reset_password(database, "ghost", disable_second_factor=False) is None

    password = reset_password(database, "admin", disable_second_factor=True)
    assert password is not None
    admin.login("admin", password)
    assert admin.get("/me").json()["username"] == "admin"


@needs_fdroid
def test_detach_repositories_restores_the_passwords(
    fdroid_admin: Api, repository_copy: Callable[[str], Path]
) -> None:
    path = repository_copy("small")
    passwords = {key: yamlfile.load(path / "config.yml")[key] for key in ("keystorepass", "keypass")}
    fdroid_admin.post("/repositories/import", {"path": str(path), "slug": "small", "movePasswords": True})
    assert yamlfile.load(path / "config.yml")["keypass"] == {"env": "FDROID_PANEL_KEYPASS"}

    state = fdroid_admin.state
    assert detach_repositories(state.database, state.settings) == [str(path)]
    config = yamlfile.load(path / "config.yml")
    assert {key: config[key] for key in passwords} == passwords
