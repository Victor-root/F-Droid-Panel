"""Startup configuration, read from a TOML file written by the installer.

Only what is needed before the database is open lives here; everything else is
edited in the interface and stored in the database.
"""

from __future__ import annotations

import ipaddress
import os
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib

CONFIG_ENV = "FDROID_PANEL_CONFIG"
DEFAULT_CONFIG_PATH = Path("/etc/fdroid-panel/panel.toml")


class Settings(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    # Public address of the panel and the repositories, such as https://fdroid.example.org.
    # Without it, the address of each request is used.
    public_url: str | None = None
    host: str = "127.0.0.1"
    port: int = Field(default=8080, ge=1, le=65535)
    data_dir: Path = Path("/var/lib/fdroid-panel")
    secrets_dir: Path = Path("/etc/fdroid-panel/secrets")
    # Directory of the request files read by the root maintenance helper.
    maintenance_dir: Path = Path("/var/lib/fdroid-panel/maintenance")
    # fdroid executable used for new repositories (the managed one installed by install.sh).
    fdroid_command: str = "/opt/fdroid-panel/fdroidserver-venv/bin/fdroid"
    # Addresses of reverse proxies allowed to set X-Forwarded-For and X-Forwarded-Proto.
    trusted_proxies: list[str] = ["127.0.0.1", "::1"]
    # "auto" marks cookies Secure when the request arrived over HTTPS.
    secure_cookies: Literal["auto", "always", "never"] = "auto"
    log_level: Literal["debug", "info", "warning", "error"] = "info"

    @field_validator("trusted_proxies")
    @classmethod
    def _valid_networks(cls, value: list[str]) -> list[str]:
        for entry in value:
            ipaddress.ip_network(entry, strict=False)
        return value

    @property
    def database_path(self) -> Path:
        return self.data_dir / "panel.db"

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"

    @property
    def staging_dir(self) -> Path:
        return self.data_dir / "staging"

    @property
    def backups_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def repos_dir(self) -> Path:
        return self.data_dir / "repos"


def load_settings(path: Path | None = None) -> Settings:
    if path is None:
        path = Path(os.environ.get(CONFIG_ENV, DEFAULT_CONFIG_PATH))
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path} (set {CONFIG_ENV} to use another one)")
    with path.open("rb") as file:
        return Settings.model_validate(tomllib.load(file))
