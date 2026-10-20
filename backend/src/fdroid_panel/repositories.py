"""Repository operations: inspection, creation, publication, all driven through fdroidserver."""

from __future__ import annotations

import asyncio
import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from importlib import resources
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import delete

from . import yamlfile
from .backups import Backups
from .db import Database
from .fdroid import indexed_versions
from .jobs import JobContext, JobFailed, JobFunction, minimal_environment
from .models import PendingChange, Repository, utcnow
from .secrets_store import KEY_PASSWORD_ENV, KEYSTORE_PASSWORD_ENV, SecretStore

DEFAULT_ARCHIVE_OLDER = 3
REPO_ICON = "icon.png"
SECTIONS = ("repo", "archive")
INDEX_FILES = (
    "entry.jar",
    "entry.json",
    "index-v1.jar",
    "index-v1.json",
    "index-v2.json",
    "index.jar",
    "index.xml",
    "index.html",
    "index.css",
    "index.png",
)
# Warnings fdroidserver prints, without failing, when it leaves an APK out of the index.
LEFT_OUT_PATTERNS = (
    (re.compile(r'"(?P<file>[^"]+\.apk)" is signed by a key that is not allowed'), "signer_not_allowed"),
    (re.compile(r"Ignoring package without metadata: (?P<file>\S+\.apk)"), "no_metadata"),
)
KEYTOOL_TIMEOUT = 60


def url_prefix(repo_url: str) -> str:
    """The public path in front of repo/.

    "https://host/fdroid/repo" gives "fdroid", "https://host/repo" gives "".
    """
    path = urlsplit(repo_url).path.strip("/")
    if path != "repo" and not path.endswith("/repo"):
        raise ValueError("repo_url must end with /repo")
    return path[: -len("repo")].strip("/")


def public_repo_url(base_url: str, prefix: str, section: str = "repo") -> str:
    return "/".join(part for part in (base_url.rstrip("/"), prefix, section) if part)


async def certificate_fingerprint(jar: Path, home: Path) -> str | None:
    """SHA-256 of the certificate that signed a jar, read without any password."""
    if not jar.is_file():
        return None
    process = await asyncio.create_subprocess_exec(
        "keytool",
        "-printcert",
        "-jarfile",
        str(jar),
        env=minimal_environment(home),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    output, _ = await asyncio.wait_for(process.communicate(), KEYTOOL_TIMEOUT)
    match = re.search(r"SHA256:\s*([0-9A-F:]{95})", output.decode(errors="replace"))
    return match.group(1).replace(":", "").lower() if match else None


def _plain_password(value: Any) -> bool:
    return isinstance(value, str) and value != ""


@dataclass
class Inspection:
    path: str
    exists: bool
    is_repository: bool = False
    writable: bool = False
    repo_url: str | None = None
    repo_name: str | None = None
    repo_description: str | None = None
    archive_older: int | None = None
    keystore_found: bool = False
    passwords_in_config: bool = False
    apps: int = 0
    apks: int = 0
    published_at: datetime | None = None
    fingerprint: str | None = None
    problems: list[str] = field(default_factory=list)


def read_config(repository: Path) -> dict[str, Any]:
    return dict(yamlfile.load(repository / "config.yml"))


def _index_timestamp(repository: Path) -> datetime | None:
    index = repository / "repo" / "index-v2.json"
    if not index.is_file():
        return None
    timestamp = json.loads(index.read_text(encoding="utf-8")).get("repo", {}).get("timestamp")
    return datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc) if timestamp else None


def count_apps(repository: Path) -> tuple[int, int]:
    apps = len(list((repository / "metadata").glob("*.yml")))
    apks = len(list((repository / "repo").glob("*.apk")))
    return apps, apks


async def inspect(path: Path, home: Path) -> Inspection:
    """What the import wizard shows before anything is written."""
    report = Inspection(path=str(path), exists=path.is_dir())
    if not report.exists:
        report.problems.append("path_not_found")
        return report
    config_path = path / "config.yml"
    report.is_repository = config_path.is_file()
    if not report.is_repository:
        report.problems.append("not_a_repository")
        return report
    report.writable = all(os.access(target, os.W_OK) for target in (path, config_path))
    if not report.writable:
        report.problems.append("not_writable")
    try:
        config = read_config(path)
    except (OSError, ValueError):
        report.problems.append("config_unreadable")
        return report

    report.repo_url = config.get("repo_url")
    report.repo_name = config.get("repo_name")
    report.repo_description = config.get("repo_description")
    archive_older = config.get("archive_older")
    report.archive_older = archive_older if isinstance(archive_older, int) else None
    keystore = Path(str(config.get("keystore", "keystore.p12"))).expanduser()
    keystore = keystore if keystore.is_absolute() else path / keystore
    report.keystore_found = keystore.is_file()
    if not report.keystore_found:
        report.problems.append("keystore_missing")
    elif keystore.stat().st_mode & 0o077:
        report.problems.append("keystore_readable_by_others")
    report.passwords_in_config = _plain_password(config.get("keystorepass")) or _plain_password(
        config.get("keypass")
    )
    if report.repo_url is None:
        report.problems.append("repo_url_missing")
    else:
        try:
            url_prefix(report.repo_url)
        except ValueError:
            report.problems.append("repo_url_invalid")
    report.apps, report.apks = count_apps(path)
    report.published_at = _index_timestamp(path)
    report.fingerprint = await certificate_fingerprint(path / "repo" / "entry.jar", home)
    return report


def secret_environment(secrets: SecretStore, repository_id: int) -> dict[str, str]:
    values = secrets.read(repository_id)
    return {name: values[name] for name in (KEYSTORE_PASSWORD_ENV, KEY_PASSWORD_ENV) if name in values}


def move_passwords_out_of_config(secrets: SecretStore, repository_id: int, repository: Path) -> bool:
    """Stores clear passwords of config.yml in the secret store and makes config.yml refer to them."""
    config = read_config(repository)
    store_password, key_password = config.get("keystorepass"), config.get("keypass")
    if not (_plain_password(store_password) and _plain_password(key_password)):
        return False
    secrets.write(
        repository_id, {KEYSTORE_PASSWORD_ENV: str(store_password), KEY_PASSWORD_ENV: str(key_password)}
    )
    yamlfile.update(
        repository / "config.yml",
        {"keystorepass": {"env": KEYSTORE_PASSWORD_ENV}, "keypass": {"env": KEY_PASSWORD_ENV}},
        mode=0o600,
    )
    return True


def index_files(repository: Path) -> list[str]:
    """Every published index file, the ones a publication rewrites."""
    files = [f"{section}/{name}" for section in SECTIONS for name in INDEX_FILES]
    for section in SECTIONS:
        files += [
            str(path.relative_to(repository)) for path in (repository / section / "diff").glob("*.json")
        ]
    return files


def _left_out(output: list[str]) -> list[dict[str, str]]:
    found: dict[str, str] = {}
    for line in output:
        for pattern, reason in LEFT_OUT_PATTERNS:
            match = pattern.search(line)
            if match:
                found[Path(match.group("file")).name] = reason
    return [{"file": name, "reason": reason} for name, reason in sorted(found.items())]


@dataclass(frozen=True)
class RepositoryRef:
    """What a job needs of a repository, read before the job is queued."""

    id: int
    path: Path
    fdroid_command: str
    fingerprint: str | None


def publish_job(
    database: Database, backups: Backups, secrets: SecretStore, home: Path, ref: RepositoryRef
) -> JobFunction:
    async def run(context: JobContext) -> dict[str, Any]:
        environment = secret_environment(secrets, ref.id)
        context.secrets.extend(environment.values())
        backup = backups.snapshot(ref.id, ref.path, index_files(ref.path), "publish")
        context.log(f"Backup of the current index: {backup.name}")

        result = await context.run(
            [ref.fdroid_command, "update", "--pretty"],
            cwd=ref.path,
            env=minimal_environment(home, environment),
        )

        index = ref.path / "repo" / "index-v2.json"
        if not index.is_file():
            backups.restore(ref.id, backup.name, ref.path)
            raise JobFailed("index_not_written")
        fingerprint = await certificate_fingerprint(ref.path / "repo" / "entry.jar", home)
        if fingerprint is None:
            backups.restore(ref.id, backup.name, ref.path)
            raise JobFailed("index_not_signed")
        if ref.fingerprint is not None and fingerprint != ref.fingerprint:
            backups.restore(ref.id, backup.name, ref.path)
            context.log("The index was signed by another key than before: the previous index was put back.")
            raise JobFailed("signing_key_changed", expected=ref.fingerprint, found=fingerprint)

        versions = indexed_versions(index)
        archived = (
            indexed_versions(ref.path / "archive" / "index-v2.json")
            if (ref.path / "archive" / "index-v2.json").is_file()
            else {}
        )
        left_out = _left_out(result.output)
        for item in left_out:
            context.log(f"Left out of the index: {item['file']} ({item['reason']})")

        with database.session() as db:
            repository = db.get(Repository, ref.id)
            if repository is not None:
                repository.fingerprint = fingerprint
                repository.published_at = utcnow()
                db.execute(delete(PendingChange).where(PendingChange.repository_id == ref.id))
                db.commit()
        context.log("Published and verified.")
        return {
            "apps": len(versions),
            "versions": sum(len(codes) for codes in versions.values()),
            "archived": sum(len(codes) for codes in archived.values()),
            "leftOut": left_out,
            "fingerprint": fingerprint,
            "backup": backup.name,
        }

    return run


def rollback_job(backups: Backups, repository_id: int, path: Path) -> JobFunction:
    """Puts back the index that was published before the last publication."""

    async def run(context: JobContext) -> dict[str, Any]:
        previous = next(
            (backup for backup in backups.history(repository_id) if backup.reason == "publish"), None
        )
        if previous is None:
            raise JobFailed("nothing_to_roll_back")
        restored = backups.restore(repository_id, previous.name, path)
        context.log(f"Restored {len(restored)} index files from {previous.name}.")
        return {"backup": previous.name}

    return run


def default_icon() -> bytes:
    return (resources.files("fdroid_panel") / "data" / "default-repo-icon.png").read_bytes()


@dataclass(frozen=True)
class NewRepository:
    id: int
    path: Path
    name: str
    description: str
    repo_url: str
    archive_older: int
    fdroid_command: str


def create_job(
    database: Database, backups: Backups, secrets: SecretStore, home: Path, new: NewRepository
) -> JobFunction:
    """Creates a repository with `fdroid init`, keeps its passwords out of config.yml and publishes it."""

    async def run(context: JobContext) -> dict[str, Any] | None:
        new.path.mkdir(parents=True, exist_ok=True, mode=0o750)
        if any(new.path.iterdir()):
            raise JobFailed("directory_not_empty", path=str(new.path))
        await context.run(
            [
                new.fdroid_command,
                "init",
                "--no-prompt",
                "--repo-keyalias",
                "fdroid-panel",
                "--distinguished-name",
                f"CN={new.name}, OU=F-Droid Panel",
            ],
            cwd=new.path,
            env=minimal_environment(home),
        )
        config = read_config(new.path)
        context.secrets.extend(str(config.get(key, "")) for key in ("keystorepass", "keypass"))
        move_passwords_out_of_config(secrets, new.id, new.path)
        yamlfile.update(
            new.path / "config.yml",
            {
                "repo_url": new.repo_url,
                "repo_name": new.name,
                "repo_description": new.description,
                "repo_icon": REPO_ICON,
                "archive_older": new.archive_older,
            },
            mode=0o600,
        )
        icons = new.path / "repo" / "icons"
        icons.mkdir(parents=True, exist_ok=True)
        (icons / REPO_ICON).write_bytes(default_icon())
        (new.path / "metadata").mkdir(exist_ok=True)
        context.log("Repository created; publishing its first, empty index.")
        ref = RepositoryRef(id=new.id, path=new.path, fdroid_command=new.fdroid_command, fingerprint=None)
        return await publish_job(database, backups, secrets, home, ref)(context)

    return run
