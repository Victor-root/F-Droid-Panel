from __future__ import annotations

import platform
import shutil
from pathlib import PurePosixPath
from typing import Any, Literal

from fastapi import APIRouter, Request
from sqlalchemy import select

from .. import __version__, audit
from ..auth import AdminAuth, Db, require_recent_auth
from ..config import Settings
from ..errors import conflict, invalid, not_found
from ..fdroid import MIN_VERSION, probe, self_test
from ..jobs import JobRunner
from ..maintenance import Maintenance
from ..models import Job, User
from .jobs import JobOut, job_out
from .schemas import ApiModel

router = APIRouter(prefix="/system", tags=["system"])

SELF_TEST_KIND = "self_test"


class FdroidOut(ApiModel):
    command: str
    version: str | None
    error: str | None
    supported: bool
    minimum_version: str


class DiskOut(ApiModel):
    total: int
    free: int


class SystemOut(ApiModel):
    version: str
    # Address repositories are published under, as F-Droid clients see it.
    public_url: str
    python: str
    fdroid: FdroidOut
    self_test: JobOut | None
    disk: DiskOut


class JobStartedOut(ApiModel):
    job_id: int


def latest_self_test(db: Db) -> Job | None:
    return db.scalar(select(Job).where(Job.kind == SELF_TEST_KIND).order_by(Job.id.desc()).limit(1))


def start_self_test(settings: Settings, runner: JobRunner, user_id: int | None) -> int:
    function = self_test(settings.fdroid_command, settings.data_dir / "home", settings.data_dir / "tmp")
    return runner.submit(kind=SELF_TEST_KIND, function=function, user_id=user_id)


@router.get("")
async def get_system(request: Request, db: Db, auth: AdminAuth) -> SystemOut:
    del auth
    settings: Settings = request.app.state.settings
    info = await probe(settings.fdroid_command, settings.data_dir / "home")
    job = latest_self_test(db)
    creator = db.get(User, job.created_by) if job and job.created_by else None
    usage = shutil.disk_usage(settings.data_dir)
    return SystemOut(
        version=__version__,
        public_url=(settings.public_url or str(request.base_url)).rstrip("/"),
        python=platform.python_version(),
        fdroid=FdroidOut(
            command=info.command,
            version=info.version,
            error=info.error,
            supported=info.supported,
            minimum_version=".".join(map(str, MIN_VERSION)),
        ),
        self_test=job_out(job, creator.username if creator else None) if job else None,
        disk=DiskOut(total=usage.total, free=usage.free),
    )


@router.post("/self-test", status_code=202)
def run_self_test(request: Request, db: Db, auth: AdminAuth) -> JobStartedOut:
    job_id = start_self_test(request.app.state.settings, request.app.state.jobs, auth.user.id)
    audit.record(db, "system.self_test", user=auth.user, ip=auth.ip)
    db.commit()
    return JobStartedOut(job_id=job_id)


class MaintenanceOut(ApiModel):
    available: bool
    # Written by the helper: version, channel, commit, fdroidserver.
    installed: dict[str, Any] | None
    # The release found by the last update check: checkedAt, channel, version, commit, newer.
    latest: dict[str, Any] | None


class MaintenanceIn(ApiModel):
    action: Literal["check", "update", "update-fdroidserver", "grant"]
    path: str | None = None


class MaintenanceStartedOut(ApiModel):
    id: str


class MaintenanceStateOut(ApiModel):
    state: str
    code: str | None
    params: dict[str, Any]
    log: list[str]


def _maintenance(request: Request) -> Maintenance:
    maintenance: Maintenance = request.app.state.maintenance
    return maintenance


@router.get("/maintenance")
def get_maintenance(request: Request, auth: AdminAuth) -> MaintenanceOut:
    del auth
    maintenance = _maintenance(request)
    if not maintenance.available:
        return MaintenanceOut(available=False, installed=None, latest=None)
    return MaintenanceOut(available=True, installed=maintenance.installed(), latest=maintenance.latest())


@router.post("/maintenance", status_code=202)
def request_maintenance(
    body: MaintenanceIn, request: Request, db: Db, auth: AdminAuth
) -> MaintenanceStartedOut:
    maintenance = _maintenance(request)
    if not maintenance.available:
        raise conflict("maintenance_unavailable")
    if body.action != "check":
        require_recent_auth(auth)
    if body.action == "grant" and not (body.path and PurePosixPath(body.path).is_absolute()):
        raise invalid("path_not_absolute")
    request_id = maintenance.request(body.action, body.path if body.action == "grant" else None)
    audit.record(
        db,
        "system.maintenance",
        user=auth.user,
        ip=auth.ip,
        target=body.action,
        details={"path": body.path} if body.action == "grant" else None,
    )
    db.commit()
    return MaintenanceStartedOut(id=request_id)


@router.get("/maintenance/{request_id}")
def get_maintenance_request(request_id: str, request: Request, auth: AdminAuth) -> MaintenanceStateOut:
    del auth
    state = _maintenance(request).state(request_id)
    if state is None:
        raise not_found()
    return MaintenanceStateOut(state=state.state, code=state.code, params=state.params, log=state.log)
