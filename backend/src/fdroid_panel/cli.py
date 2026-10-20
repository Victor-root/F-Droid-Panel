"""The `fdroid-panel` command used by the installer and the systemd service."""

from __future__ import annotations

import argparse
import ipaddress
import logging
import sys
from datetime import timedelta
from pathlib import Path

from .config import Settings, load_settings
from .db import Database, create_database_engine, migrate
from .models import SetupCode, utcnow
from .security import hash_token, new_code

DEFAULT_SETUP_CODE_HOURS = 24


def create_setup_code(database: Database, hours: int = DEFAULT_SETUP_CODE_HOURS) -> str:
    code = new_code()
    with database.session() as db:
        db.add(SetupCode(code_hash=hash_token(code), expires_at=utcnow() + timedelta(hours=hours)))
        db.commit()
    return code


def _open_database(settings: Settings) -> Database:
    settings.data_dir.mkdir(parents=True, exist_ok=True, mode=0o750)
    engine = create_database_engine(settings.database_path)
    migrate(engine)
    return Database(engine)


def _serve(settings: Settings) -> None:
    import uvicorn

    from .app import create_app

    networks = [str(ipaddress.ip_network(entry, strict=False)) for entry in settings.trusted_proxies]
    uvicorn.run(
        create_app(settings),
        host=settings.host,
        port=settings.port,
        proxy_headers=True,
        forwarded_allow_ips=networks,
        log_level=settings.log_level,
        server_header=False,
    )


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="fdroid-panel", description="Web dashboard for F-Droid repositories."
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="configuration file (default: $FDROID_PANEL_CONFIG or /etc/fdroid-panel/panel.toml)",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("serve", help="run the web server")
    commands.add_parser("migrate", help="create or upgrade the database")
    setup = commands.add_parser(
        "setup-code", help="print a one-time code to create an administrator in the browser"
    )
    setup.add_argument("--hours", type=int, default=DEFAULT_SETUP_CODE_HOURS, help="validity in hours")
    args = parser.parse_args(argv)

    settings = load_settings(args.config)
    logging.basicConfig(level=settings.log_level.upper(), format="%(levelname)s %(name)s: %(message)s")

    if args.command == "serve":
        _serve(settings)
    elif args.command == "migrate":
        _open_database(settings)
    elif args.command == "setup-code":
        if not 1 <= args.hours <= 24 * 7:
            parser.error("--hours must be between 1 and 168")
        sys.stdout.write(create_setup_code(_open_database(settings), args.hours) + "\n")


if __name__ == "__main__":
    main()
