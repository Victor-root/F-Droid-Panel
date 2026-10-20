from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select

from ..auth import CurrentAuth, Db, readable_repository_ids
from ..errors import not_found
from ..jobs import JobRunner
from ..models import Job, JobStatus, User
from .schemas import ApiModel, Page

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobOut(ApiModel):
    id: int
    repository_id: int | None
    kind: str
    status: JobStatus
    created_by: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: dict[str, Any] | None
    result: dict[str, Any] | None


def job_out(job: Job, username: str | None) -> JobOut:
    return JobOut(
        id=job.id,
        repository_id=job.repository_id,
        kind=job.kind,
        status=job.status,
        created_by=username,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        error=job.error,
        result=job.result,
    )


def _visible(auth: CurrentAuth, db: Db) -> Any:
    repository_ids = readable_repository_ids(db, auth)
    if repository_ids is None:
        return True
    return or_(Job.repository_id.in_(repository_ids), Job.created_by == auth.user.id)


def _runner(request: Request) -> JobRunner:
    runner: JobRunner = request.app.state.jobs
    return runner


def get_visible_job(db: Db, auth: CurrentAuth, job_id: int) -> Job:
    job = db.scalar(select(Job).where(Job.id == job_id, _visible(auth, db)))
    if job is None:
        raise not_found("job_not_found")
    return job


@router.get("")
def list_jobs(
    db: Db,
    auth: CurrentAuth,
    repository_id: int | None = Query(default=None, alias="repositoryId"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[JobOut]:
    query = select(Job, User.username).outerjoin(User, User.id == Job.created_by).where(_visible(auth, db))
    if repository_id is not None:
        query = query.where(Job.repository_id == repository_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(Job.id.desc()).limit(limit).offset(offset)).all()
    return Page(items=[job_out(job, username) for job, username in rows], total=total)


@router.get("/{job_id}")
def get_job(job_id: int, db: Db, auth: CurrentAuth) -> JobOut:
    job = get_visible_job(db, auth, job_id)
    creator = db.get(User, job.created_by) if job.created_by else None
    return job_out(job, creator.username if creator else None)


@router.get("/{job_id}/log")
def get_log(job_id: int, request: Request, db: Db, auth: CurrentAuth) -> list[str]:
    get_visible_job(db, auth, job_id)
    return _runner(request).read_log(job_id)


@router.get("/{job_id}/stream")
def stream_log(job_id: int, request: Request, db: Db, auth: CurrentAuth) -> StreamingResponse:
    """Server-Sent Events: one `line` event per log line, then an `end` event."""
    get_visible_job(db, auth, job_id)
    runner = _runner(request)

    async def events() -> AsyncIterator[str]:
        async for line in runner.follow(job_id):
            yield f"event: line\ndata: {line}\n\n"
        yield "event: end\ndata: \n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})
