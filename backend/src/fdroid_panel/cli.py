"""The `fdroid-panel` command used by the installer and the systemd service."""

from __future__ import annotations

import argparse
import ipaddress
import logging
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import delete, select

from . import audit
from .config import Settings, load_settings
from .db import Database, create_database_engine, migrate
from .models import LoginAttempt, Repository, Session, SetupCode, User, utcnow
from .repositories import restore_passwords_to_config
from .secrets_store import SecretStore
from .security import hash_password, hash_token, new_code

DEFAULT_SETUP_CODE_HOURS = 24


def create_setup_code(database: Database, hours: int = DEFAULT_SETUP_CODE_HOURS) -> str:
    code = new_code()
    with database.session() as db:
        db.add(SetupCode(code_hash=hash_token(code), expires_at=utcnow() + timedelta(hours=hours)))
        db.commit()
    return code


def list_users(database: Database) -> list[str]:
    with database.session() as db:
        users = db.scalars(select(User).order_by(User.username))
        return [f"{user.username} {user.role.value}{' disabled' if user.disabled else ''}" for user in users]


def reset_password(database: Database, username: str, disable_second_factor: bool) -> str | None:
    """Gives the account a new random password and ends its sessions; None when it does not exist."""
    password = new_code(groups=4)
    with database.session() as db:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            return None
        user.password_hash = hash_password(password)
        user.password_changed_at = utcnow()
        if disable_second_factor:
            user.totp_enabled = False
            user.totp_secret = None
            user.recovery_codes.clear()
        db.execute(delete(Session).where(Session.user_id == user.id))
        # Failed attempts would otherwise keep the account locked for a while.
        db.execute(
            delete(LoginAttempt).where(LoginAttempt.username == username, LoginAttempt.success.is_(False))
        )
        audit.record(db, "user.password_reset", user=None, ip=None, target=username)
        db.commit()
    return password


def detach_repositories(database: Database, settings: Settings) -> list[str]:
    """Before the panel is removed: puts each repository's passwords back into its config.yml."""
    secrets = SecretStore(settings.secrets_dir)
    with database.session() as db:
        repositories = db.scalars(select(Repository).order_by(Repository.id)).all()
        for repository in repositories:
            restore_passwords_to_config(secrets, repository.id, Path(repository.path))
        return [repository.path for repository in repositories]


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
    commands.add_parser(
        "detach-repositories",
        help="put the keystore passwords back into each repository's config.yml and print their paths",
    )
    commands.add_parser("users", help="list the accounts: username, role, and whether it is disabled")
    reset = commands.add_parser("reset-password", help="print a new random password for an account")
    reset.add_argument("username")
    reset.add_argument(
        "--disable-second-factor", action="store_true", help="also turn off two-step verification"
    )
    args = parser.parse_args(argv)

    settings = load_settings(args.config)
    # The other commands print a result for the installer: only problems are logged next to it.
    level = settings.log_level.upper() if args.command in ("serve", "migrate") else "WARNING"
    logging.basicConfig(level=level, format="%(levelname)s %(name)s: %(message)s")

    if args.command == "serve":
        _serve(settings)
    elif args.command == "migrate":
        _open_database(settings)
    elif args.command == "setup-code":
        if not 1 <= args.hours <= 24 * 7:
            parser.error("--hours must be between 1 and 168")
        sys.stdout.write(create_setup_code(_open_database(settings), args.hours) + "\n")
    elif args.command == "detach-repositories":
        paths = detach_repositories(_open_database(settings), settings)
        sys.stdout.writelines(path + "\n" for path in paths)
    elif args.command == "users":
        sys.stdout.writelines(line + "\n" for line in list_users(_open_database(settings)))
    elif args.command == "reset-password":
        password = reset_password(_open_database(settings), args.username, args.disable_second_factor)
        if password is None:
            sys.exit(f"No account named {args.username}")
        sys.stdout.write(password + "\n")


if __name__ == "__main__":
    main()
