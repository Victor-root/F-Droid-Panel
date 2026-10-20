from __future__ import annotations

import re
import secrets
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, Response
from pydantic import Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from .. import audit, yamlfile
from ..auth import (
    AdminAuth,
    Auth,
    CurrentAuth,
    Db,
    readable_repository_ids,
    repository_for,
    require_recent_auth,
)
from ..backups import Backups
from ..config import Settings
from ..errors import conflict, invalid
from ..jobs import JobRunner
from ..models import AccessAccount, Job, JobStatus, PendingChange, Repository, User
from ..repositories import (
    DEFAULT_ARCHIVE_OLDER,
    NewRepository,
    RepositoryRef,
    count_apps,
    create_job,
    inspect,
    move_passwords_out_of_config,
    public_repo_url,
    publish_job,
    read_config,
    repository_icon,
    restore_passwords_to_config,
    rollback_job,
    url_prefix,
)
from ..secrets_store import SecretStore
from ..security import hash_password
from .jobs import JobOut, job_out
from .schemas import ApiModel

router = APIRouter(prefix="/repositories", tags=["repositories"])

SLUG_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
PREFIX_PATTERN = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)?$")
# Public paths the panel needs for itself.
RESERVED_PREFIXES = {"admin", "assets"}
PUBLISH_KIND = "publish"


class RepositoryOut(ApiModel):
    id: int
    slug: str
    name: str
    path: str
    url_prefix: str
    repo_url: str
    private: bool
    served_by_panel: bool
    auto_publish: bool
    created_by_panel: bool
    fingerprint: str | None
    published_at: datetime | None
    pending_changes: int
    apps: int
    apks: int
    last_job: JobOut | None


class PendingChangeOut(ApiModel):
    at: datetime
    username: str | None
    kind: str
    target: str | None


class RepositoryDetailOut(RepositoryOut):
    description: str
    archive_older: int
    changes: list[PendingChangeOut]
    can_write: bool


class InspectionOut(ApiModel):
    path: str
    exists: bool
    is_repository: bool
    writable: bool
    repo_url: str | None
    repo_name: str | None
    repo_description: str | None
    archive_older: int | None
    keystore_found: bool
    passwords_in_config: bool
    apps: int
    apks: int
    published_at: datetime | None
    fingerprint: str | None
    problems: list[str]
    url_prefix: str | None
    already_registered: bool


class ImportIn(ApiModel):
    path: str = Field(min_length=1, max_length=4096)
    slug: str
    move_passwords: bool = True


class CreateIn(ApiModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="", max_length=2000)
    slug: str
    url_prefix: str
    private: bool = False
    archive_older: int = Field(default=DEFAULT_ARCHIVE_OLDER, ge=0, le=100)


class UpdateIn(ApiModel):
    auto_publish: bool | None = None
    private: bool | None = None


class SettingsIn(ApiModel):
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(max_length=2000)
    archive_older: int = Field(ge=0, le=100)


class JobStartedOut(ApiModel):
    job_id: int


class CreatedOut(ApiModel):
    repository: RepositoryOut
    job_id: int


class AccessAccountOut(ApiModel):
    id: int
    username: str
    label: str
    disabled: bool
    created_at: datetime
    last_used_at: datetime | None


class AccessAccountIn(ApiModel):
    label: str = Field(min_length=1, max_length=128)
    username: str

    @field_validator("username")
    @classmethod
    def _username(cls, value: str) -> str:
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", value):
            raise ValueError("invalid_username")
        return value


class AccessAccountCreatedOut(AccessAccountOut):
    password: str


class BackupOut(ApiModel):
    name: str
    reason: str
    created_at: datetime
    files: int


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def _runner(request: Request) -> JobRunner:
    runner: JobRunner = request.app.state.jobs
    return runner


def _backups(request: Request) -> Backups:
    backups: Backups = request.app.state.backups
    return backups


def _secrets(request: Request) -> SecretStore:
    store: SecretStore = request.app.state.secrets
    return store


def public_base_url(request: Request) -> str:
    return (_settings(request).public_url or str(request.base_url)).rstrip("/")


def _home(request: Request) -> Path:
    return _settings(request).data_dir / "home"


def _last_jobs(db: DbSession, repository_ids: list[int]) -> dict[int, tuple[Job, str | None]]:
    latest = (
        select(Job.repository_id, func.max(Job.id).label("id"))
        .where(Job.repository_id.in_(repository_ids))
        .group_by(Job.repository_id)
        .subquery()
    )
    rows = db.execute(
        select(Job, User.username)
        .join(latest, latest.c.id == Job.id)
        .outerjoin(User, User.id == Job.created_by)
    ).all()
    return {job.repository_id: (job, username) for job, username in rows if job.repository_id is not None}


def repository_out(
    request: Request, repository: Repository, last: tuple[Job, str | None] | None
) -> RepositoryOut:
    path = Path(repository.path)
    apps, apks = count_apps(path)
    return RepositoryOut(
        id=repository.id,
        slug=repository.slug,
        name=repository.name,
        path=repository.path,
        url_prefix=repository.url_prefix,
        repo_url=public_repo_url(public_base_url(request), repository.url_prefix),
        private=repository.private,
        served_by_panel=repository.served_by_panel,
        auto_publish=repository.auto_publish,
        created_by_panel=repository.created_by_panel,
        fingerprint=repository.fingerprint,
        published_at=repository.published_at,
        pending_changes=len(repository.pending_changes),
        apps=apps,
        apks=apks,
        last_job=job_out(*last) if last else None,
    )


def _detail(request: Request, db: DbSession, auth: Auth, repository: Repository) -> RepositoryDetailOut:
    base = repository_out(request, repository, _last_jobs(db, [repository.id]).get(repository.id))
    config = read_config(Path(repository.path))
    archive_older = config.get("archive_older", 0)
    return RepositoryDetailOut(
        **base.model_dump(),
        description=str(config.get("repo_description") or ""),
        archive_older=archive_older if isinstance(archive_older, int) else 0,
        changes=[PendingChangeOut.model_validate(change) for change in repository.pending_changes],
        can_write=auth.can_write(repository),
    )


def _check_identifiers(db: DbSession, slug: str, prefix: str, path: str) -> None:
    if not SLUG_PATTERN.fullmatch(slug):
        raise invalid("invalid_slug")
    if not PREFIX_PATTERN.fullmatch(prefix) or prefix in RESERVED_PREFIXES:
        raise invalid("invalid_url_prefix")
    if db.scalar(select(Repository).where(Repository.slug == slug)):
        raise conflict("slug_taken")
    if db.scalar(select(Repository).where(Repository.url_prefix == prefix)):
        raise conflict("url_prefix_taken")
    if db.scalar(select(Repository).where(Repository.path == path)):
        raise conflict("repository_already_registered")


def record_change(
    request: Request,
    db: DbSession,
    repository: Repository,
    user: User | None,
    kind: str,
    target: str | None = None,
) -> None:
    """Notes a change the index does not include yet; publishes at once when the repository asks for it."""
    db.add(
        PendingChange(
            repository_id=repository.id, username=user.username if user else None, kind=kind, target=target
        )
    )
    db.commit()
    if repository.auto_publish:
        start_publish(request, db, repository, user)


def start_publish(request: Request, db: DbSession, repository: Repository, user: User | None) -> int:
    waiting = db.scalar(
        select(Job.id).where(
            Job.repository_id == repository.id, Job.kind == PUBLISH_KIND, Job.status == JobStatus.QUEUED
        )
    )
    if waiting is not None:
        return waiting
    ref = RepositoryRef(
        id=repository.id,
        path=Path(repository.path),
        fdroid_command=repository.fdroid_command,
        fingerprint=repository.fingerprint,
    )
    function = publish_job(
        request.app.state.database, _backups(request), _secrets(request), _home(request), ref
    )
    return _runner(request).submit(
        kind=PUBLISH_KIND,
        function=function,
        repository_id=repository.id,
        user_id=user.id if user else None,
        lock_path=ref.path,
    )


@router.get("")
def list_repositories(request: Request, db: Db, auth: CurrentAuth) -> list[RepositoryOut]:
    query = select(Repository).order_by(Repository.name)
    allowed = readable_repository_ids(db, auth)
    if allowed is not None:
        query = query.where(Repository.id.in_(allowed))
    repositories = list(db.scalars(query))
    last = _last_jobs(db, [repository.id for repository in repositories])
    return [repository_out(request, repository, last.get(repository.id)) for repository in repositories]


@router.get("/inspect")
async def inspect_path(path: str, request: Request, db: Db, auth: AdminAuth) -> InspectionOut:
    del auth
    location = Path(path).expanduser()
    if not location.is_absolute():
        raise invalid("path_not_absolute")
    report = await inspect(location.resolve(), _home(request))
    prefix = None
    if report.repo_url:
        try:
            prefix = url_prefix(report.repo_url)
        except ValueError:
            prefix = None
    registered = db.scalar(select(Repository).where(Repository.path == report.path)) is not None
    return InspectionOut(**report.__dict__, url_prefix=prefix, already_registered=registered)


@router.post("/import", status_code=201)
async def import_repository(body: ImportIn, request: Request, db: Db, auth: AdminAuth) -> RepositoryOut:
    path = Path(body.path).expanduser().resolve()
    report = await inspect(path, _home(request))
    blocking = {
        "path_not_found",
        "not_a_repository",
        "not_writable",
        "config_unreadable",
        "repo_url_missing",
        "repo_url_invalid",
        "keystore_missing",
    }
    problem = next((problem for problem in report.problems if problem in blocking), None)
    if problem is not None or report.repo_url is None:
        raise invalid(problem or "repo_url_missing")
    prefix = url_prefix(report.repo_url)
    _check_identifiers(db, body.slug, prefix, str(path))

    repository = Repository(
        slug=body.slug,
        name=report.repo_name or body.slug,
        path=str(path),
        fdroid_command=_settings(request).fdroid_command,
        url_prefix=prefix,
        fingerprint=report.fingerprint,
        published_at=report.published_at,
    )
    db.add(repository)
    db.flush()
    if body.move_passwords and report.passwords_in_config:
        _backups(request).snapshot(repository.id, path, ["config.yml"], "passwords")
        move_passwords_out_of_config(_secrets(request), repository.id, path)
    audit.record(
        db, "repository.imported", user=auth.user, ip=auth.ip, repository_id=repository.id, target=str(path)
    )
    db.commit()
    return repository_out(request, repository, None)


@router.post("", status_code=201)
def create_repository(body: CreateIn, request: Request, db: Db, auth: AdminAuth) -> CreatedOut:
    settings = _settings(request)
    path = settings.repos_dir / body.slug
    _check_identifiers(db, body.slug, body.url_prefix, str(path))
    if path.exists() and any(path.iterdir()):
        raise conflict("directory_not_empty", path=str(path))
    repository = Repository(
        slug=body.slug,
        name=body.name,
        path=str(path),
        fdroid_command=settings.fdroid_command,
        url_prefix=body.url_prefix,
        private=body.private,
        created_by_panel=True,
    )
    db.add(repository)
    db.flush()
    new = NewRepository(
        id=repository.id,
        path=path,
        name=body.name,
        description=body.description,
        repo_url=public_repo_url(public_base_url(request), body.url_prefix),
        archive_older=body.archive_older,
        fdroid_command=settings.fdroid_command,
    )
    audit.record(
        db, "repository.created", user=auth.user, ip=auth.ip, repository_id=repository.id, target=body.name
    )
    db.commit()
    function = create_job(
        request.app.state.database, _backups(request), _secrets(request), _home(request), new
    )
    job_id = _runner(request).submit(
        kind="create", function=function, repository_id=repository.id, user_id=auth.user.id
    )
    return CreatedOut(repository=repository_out(request, repository, None), job_id=job_id)


@router.get("/{repository_id}")
def get_repository(repository_id: int, request: Request, db: Db, auth: CurrentAuth) -> RepositoryDetailOut:
    return _detail(request, db, auth, repository_for(db, auth, repository_id))


@router.patch("/{repository_id}")
def update_repository(
    repository_id: int, body: UpdateIn, request: Request, db: Db, auth: AdminAuth
) -> RepositoryDetailOut:
    repository = repository_for(db, auth, repository_id)
    changes = body.model_dump(exclude_none=True, by_alias=True)
    if body.auto_publish is not None:
        repository.auto_publish = body.auto_publish
    if body.private is not None:
        repository.private = body.private
    audit.record(
        db, "repository.updated", user=auth.user, ip=auth.ip, repository_id=repository.id, details=changes
    )
    db.commit()
    return _detail(request, db, auth, repository)


@router.get("/{repository_id}/icon")
def get_icon(repository_id: int, db: Db, auth: CurrentAuth) -> Response:
    """The icon for the interface, also for private repositories whose public files need a password."""
    repository = repository_for(db, auth, repository_id)
    icon = repository_icon(Path(repository.path))
    if icon is None:
        return Response(status_code=404)
    return FileResponse(icon, headers={"Cache-Control": "no-cache"})


@router.put("/{repository_id}/settings")
def update_settings(
    repository_id: int, body: SettingsIn, request: Request, db: Db, auth: CurrentAuth
) -> RepositoryDetailOut:
    repository = repository_for(db, auth, repository_id, write=True)
    path = Path(repository.path)
    _backups(request).snapshot(repository.id, path, ["config.yml"], "settings")
    yamlfile.update(
        path / "config.yml",
        {"repo_name": body.name, "repo_description": body.description, "archive_older": body.archive_older},
    )
    repository.name = body.name
    audit.record(db, "repository.settings", user=auth.user, ip=auth.ip, repository_id=repository.id)
    record_change(request, db, repository, auth.user, "settings")
    return _detail(request, db, auth, repository)


@router.post("/{repository_id}/publish", status_code=202)
def publish(repository_id: int, request: Request, db: Db, auth: CurrentAuth) -> JobStartedOut:
    repository = repository_for(db, auth, repository_id, write=True)
    job_id = start_publish(request, db, repository, auth.user)
    audit.record(db, "repository.publish", user=auth.user, ip=auth.ip, repository_id=repository.id)
    db.commit()
    return JobStartedOut(job_id=job_id)


@router.post("/{repository_id}/rollback", status_code=202)
def rollback(repository_id: int, request: Request, db: Db, auth: AdminAuth) -> JobStartedOut:
    repository = repository_for(db, auth, repository_id)
    path = Path(repository.path)
    job_id = _runner(request).submit(
        kind="rollback",
        function=rollback_job(_backups(request), repository.id, path),
        repository_id=repository.id,
        user_id=auth.user.id,
        lock_path=path,
    )
    audit.record(db, "repository.rollback", user=auth.user, ip=auth.ip, repository_id=repository.id)
    db.commit()
    return JobStartedOut(job_id=job_id)


@router.get("/{repository_id}/backups")
def list_backups(repository_id: int, request: Request, db: Db, auth: AdminAuth) -> list[BackupOut]:
    repository = repository_for(db, auth, repository_id)
    return [
        BackupOut(
            name=backup.name, reason=backup.reason, created_at=backup.created_at, files=len(backup.files)
        )
        for backup in _backups(request).history(repository.id)
    ]


@router.delete("/{repository_id}", status_code=204)
def unregister(repository_id: int, request: Request, db: Db, auth: AdminAuth) -> None:
    """Removes the repository from the panel only: its files stay, ready for the command line."""
    require_recent_auth(auth)
    repository = repository_for(db, auth, repository_id)
    path = Path(repository.path)
    if (path / "config.yml").is_file():
        _backups(request).snapshot(repository.id, path, ["config.yml"], "unregister")
    restore_passwords_to_config(_secrets(request), repository.id, path)
    audit.record(db, "repository.unregistered", user=auth.user, ip=auth.ip, target=repository.path)
    db.delete(repository)
    db.commit()


@router.get("/{repository_id}/access")
def list_access(repository_id: int, db: Db, auth: AdminAuth) -> list[AccessAccountOut]:
    repository = repository_for(db, auth, repository_id)
    return [AccessAccountOut.model_validate(account) for account in repository.access_accounts]


@router.post("/{repository_id}/access", status_code=201)
def create_access(
    repository_id: int, body: AccessAccountIn, db: Db, auth: AdminAuth
) -> AccessAccountCreatedOut:
    repository = repository_for(db, auth, repository_id)
    if any(account.username == body.username for account in repository.access_accounts):
        raise conflict("username_taken")
    password = secrets.token_urlsafe(18)
    account = AccessAccount(
        repository_id=repository.id,
        username=body.username,
        label=body.label,
        password_hash=hash_password(password),
    )
    db.add(account)
    db.flush()
    audit.record(
        db, "access.created", user=auth.user, ip=auth.ip, repository_id=repository.id, target=body.username
    )
    db.commit()
    return AccessAccountCreatedOut(**AccessAccountOut.model_validate(account).model_dump(), password=password)


@router.delete("/{repository_id}/access/{account_id}", status_code=204)
def delete_access(repository_id: int, account_id: int, request: Request, db: Db, auth: AdminAuth) -> None:
    repository = repository_for(db, auth, repository_id)
    account = next((item for item in repository.access_accounts if item.id == account_id), None)
    if account is None:
        raise invalid("access_account_not_found")
    audit.record(
        db, "access.deleted", user=auth.user, ip=auth.ip, repository_id=repository.id, target=account.username
    )
    db.delete(account)
    db.commit()
    request.app.state.access_cache.forget(repository.id)
