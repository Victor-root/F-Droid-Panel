from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .models import AuditEvent, User


def record(
    db: Session,
    action: str,
    *,
    user: User | None,
    ip: str | None,
    repository_id: int | None = None,
    target: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Adds an audit event to the current transaction; it is saved with the change it describes."""
    db.add(
        AuditEvent(
            action=action,
            user_id=user.id if user else None,
            username=user.username if user else None,
            ip=ip,
            repository_id=repository_id,
            target=target,
            details=details,
        )
    )
