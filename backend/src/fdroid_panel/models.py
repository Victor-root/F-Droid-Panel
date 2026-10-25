from __future__ import annotations

import enum
from datetime import date, datetime, timezone
from typing import Any, ClassVar

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator[datetime]):
    """SQLite stores datetimes without a time zone; values are always written and read back as UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetime")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        return None if value is None else value.replace(tzinfo=timezone.utc)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {datetime: UTCDateTime, dict[str, Any]: JSON}


class Role(str, enum.Enum):
    ADMIN = "admin"
    MAINTAINER = "maintainer"
    VIEWER = "viewer"


class ThemeMode(str, enum.Enum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False, length=16))
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_secret: Mapped[str | None] = mapped_column(String(64))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    theme: Mapped[ThemeMode] = mapped_column(
        Enum(ThemeMode, native_enum=False, length=16), default=ThemeMode.SYSTEM
    )
    # None follows the browser language.
    language: Mapped[str | None] = mapped_column(String(16))
    # SHA-256 of the profile picture in the avatars directory, None without one.
    avatar: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    password_changed_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_login_at: Mapped[datetime | None]

    recovery_codes: Mapped[list[RecoveryCode]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    memberships: Mapped[list[RepositoryMember]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class RecoveryCode(Base):
    __tablename__ = "recovery_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    used_at: Mapped[datetime | None]

    user: Mapped[User] = relationship(back_populates="recovery_codes")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # False between a correct password and the second factor.
    mfa_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    authenticated_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]
    ip: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str] = mapped_column(String(512))

    user: Mapped[User] = relationship()


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), index=True)
    ip: Mapped[str] = mapped_column(String(64), index=True)
    at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    success: Mapped[bool] = mapped_column(Boolean)


class SetupCode(Base):
    __tablename__ = "setup_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict[str, Any]]


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    path: Mapped[str] = mapped_column(Text, unique=True)
    fdroid_command: Mapped[str] = mapped_column(Text)
    # Public path prefix of repo/ and archive/: "" serves them at /repo and /archive.
    url_prefix: Mapped[str] = mapped_column(String(128), unique=True)
    private: Mapped[bool] = mapped_column(Boolean, default=False)
    served_by_panel: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_publish: Mapped[bool] = mapped_column(Boolean, default=False)
    # True when the panel created the repository in its data directory, False when it was imported.
    created_by_panel: Mapped[bool] = mapped_column(Boolean, default=False)
    # SHA-256 of the signing certificate, as F-Droid clients show it.
    fingerprint: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    published_at: Mapped[datetime | None]

    members: Mapped[list[RepositoryMember]] = relationship(
        back_populates="repository", cascade="all, delete-orphan"
    )
    access_accounts: Mapped[list[AccessAccount]] = relationship(
        back_populates="repository", cascade="all, delete-orphan"
    )
    pending_changes: Mapped[list[PendingChange]] = relationship(
        back_populates="repository", cascade="all, delete-orphan", order_by="PendingChange.id"
    )


class AccessAccount(Base):
    """Credentials F-Droid clients use to read a private repository (HTTP Basic authentication)."""

    __tablename__ = "access_accounts"
    __table_args__ = (UniqueConstraint("repository_id", "username"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    username: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(256))
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_used_at: Mapped[datetime | None]

    repository: Mapped[Repository] = relationship(back_populates="access_accounts")


class PendingChange(Base):
    """A change written to the repository files that the published index does not include yet."""

    __tablename__ = "pending_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    at: Mapped[datetime] = mapped_column(default=utcnow)
    username: Mapped[str | None] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(64))
    target: Mapped[str | None] = mapped_column(String(256))

    repository: Mapped[Repository] = relationship(back_populates="pending_changes")


class RepositoryMember(Base):
    __tablename__ = "repository_members"
    __table_args__ = (UniqueConstraint("repository_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    repository: Mapped[Repository] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    INTERRUPTED = "interrupted"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int | None] = mapped_column(
        ForeignKey("repositories.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus, native_enum=False, length=16), index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]
    # Error code (translated by the interface) and parameters when the job failed.
    error: Mapped[dict[str, Any] | None]
    result: Mapped[dict[str, Any] | None]


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    username: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64), index=True)
    repository_id: Mapped[int | None] = mapped_column(
        ForeignKey("repositories.id", ondelete="SET NULL"), index=True
    )
    target: Mapped[str | None] = mapped_column(String(256))
    details: Mapped[dict[str, Any] | None]


class ApkCacheEntry(Base):
    """What an APK file the published index does not list yet contains, so it is read only once."""

    __tablename__ = "apk_cache"
    __table_args__ = (UniqueConstraint("repository_id", "path"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    path: Mapped[str] = mapped_column(Text)
    size: Mapped[int]
    modified: Mapped[float]
    info: Mapped[dict[str, Any]]


class UploadStatus(str, enum.Enum):
    RECEIVING = "receiving"
    READY = "ready"
    REJECTED = "rejected"
    ADDED = "added"


class Upload(Base):
    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    filename: Mapped[str] = mapped_column(String(256))
    size: Mapped[int]
    received: Mapped[int] = mapped_column(default=0)
    status: Mapped[UploadStatus] = mapped_column(Enum(UploadStatus, native_enum=False, length=16))
    # What the APK contains and what the checks found, once it is complete.
    info: Mapped[dict[str, Any] | None]
    checks: Mapped[dict[str, Any] | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class DownloadCount(Base):
    """APK files served to F-Droid clients, counted per file and per day: nothing about who downloaded."""

    __tablename__ = "download_counts"
    __table_args__ = (UniqueConstraint("repository_id", "file", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repositories.id", ondelete="CASCADE"))
    # The APK file name, which stays the same when a version moves to the archive.
    file: Mapped[str] = mapped_column(String(256))
    day: Mapped[date]
    count: Mapped[int] = mapped_column(default=0)
