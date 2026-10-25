"""Download counts of the APK files the panel serves."""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session as DbSession

from .models import DownloadCount, utcnow


def record(db: DbSession, repository_id: int, file: str) -> None:
    statement = insert(DownloadCount).values(
        repository_id=repository_id, file=file, day=utcnow().date(), count=1
    )
    db.execute(
        statement.on_conflict_do_update(
            index_elements=["repository_id", "file", "day"],
            set_={"count": DownloadCount.count + 1},
        )
    )
    db.commit()


def totals(db: DbSession, repository_id: int, since: date | None = None) -> dict[str, int]:
    """Downloads per APK file name, since a day when given."""
    query = select(DownloadCount.file, func.sum(DownloadCount.count)).where(
        DownloadCount.repository_id == repository_id
    )
    if since is not None:
        query = query.where(DownloadCount.day >= since)
    return {file: int(count) for file, count in db.execute(query.group_by(DownloadCount.file))}
