from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import func, or_, select

from ..auth import CurrentAuth, Db, readable_repository_ids
from ..models import AuditEvent
from .schemas import ApiModel, Page

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEventOut(ApiModel):
    id: int
    at: datetime
    username: str | None
    ip: str | None
    action: str
    repository_id: int | None
    target: str | None
    details: dict[str, Any] | None


@router.get("")
def list_events(
    db: Db,
    auth: CurrentAuth,
    repository_id: int | None = Query(default=None, alias="repositoryId"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> Page[AuditEventOut]:
    query = select(AuditEvent)
    repository_ids = readable_repository_ids(db, auth)
    if repository_ids is not None:
        query = query.where(
            or_(AuditEvent.repository_id.in_(repository_ids), AuditEvent.user_id == auth.user.id)
        )
    if repository_id is not None:
        query = query.where(AuditEvent.repository_id == repository_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    events = db.scalars(query.order_by(AuditEvent.id.desc()).limit(limit).offset(offset))
    return Page(items=[AuditEventOut.model_validate(event) for event in events], total=total)
