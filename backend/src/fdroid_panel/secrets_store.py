"""Keystore passwords, kept out of config.yml in a file only the panel user can read, and the
passwords of repository access accounts, so administrators can show them again.

config.yml refers to them with fdroidserver's {env: NAME} syntax (fdroidserver 2.4.0 or later)
and the panel passes them to each fdroid command through the environment.
"""

from __future__ import annotations

import json
from pathlib import Path

from .files import write_atomic

# Names of environment variables, not passwords.
KEYSTORE_PASSWORD_ENV = "FDROID_PANEL_KEYSTOREPASS"  # noqa: S105
KEY_PASSWORD_ENV = "FDROID_PANEL_KEYPASS"  # noqa: S105


class SecretStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _path(self, repository_id: int) -> Path:
        return self.directory / f"repository-{repository_id}.json"

    def read(self, repository_id: int) -> dict[str, str]:
        path = self._path(repository_id)
        if not path.exists():
            return {}
        data: dict[str, str] = json.loads(path.read_text(encoding="utf-8"))
        return data

    def write(self, repository_id: int, values: dict[str, str]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        write_atomic(self._path(repository_id), json.dumps(values).encode("utf-8"), mode=0o600)

    def delete(self, repository_id: int) -> None:
        self._path(repository_id).unlink(missing_ok=True)

    def _access_path(self, account_id: int) -> Path:
        return self.directory / f"access-{account_id}.json"

    def read_access_password(self, account_id: int) -> str | None:
        path = self._access_path(account_id)
        if not path.exists():
            return None
        password: str = json.loads(path.read_text(encoding="utf-8"))["password"]
        return password

    def write_access_password(self, account_id: int, password: str) -> None:
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        write_atomic(
            self._access_path(account_id), json.dumps({"password": password}).encode("utf-8"), mode=0o600
        )

    def delete_access_password(self, account_id: int) -> None:
        self._access_path(account_id).unlink(missing_ok=True)
