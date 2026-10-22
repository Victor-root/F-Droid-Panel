"""Sessions, CSRF protection, login throttling and access checks."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session as DbSession

from .config import Settings
from .db import Database
from .errors import ApiError, forbidden
from .models import LoginAttempt, Repository, RepositoryMember, Role, Session, User, utcnow
from .security import hash_token, new_token, tokens_equal
from .settings_store import get_setting

SESSION_COOKIE = "fdroid_panel_session"
CSRF_HEADER = "X-CSRF-Token"
# Required on unauthenticated writes (login, setup): a custom header cannot be sent cross-site
# without a CORS preflight, which this server never grants.
CLIENT_HEADER = "X-Requested-With"
CLIENT_HEADER_VALUE = "fdroid-panel"

# The cookie outlives every session; the server decides when a session ends.
COOKIE_LIFETIME = timedelta(days=3650)
PENDING_MFA_LIFETIME = timedelta(minutes=5)
SESSIONS_KEY = "sessions"
# Administrators choose these in Settings, System; None means never.
DEFAULT_IDLE_DAYS = 7
DEFAULT_CONFIRM_MINUTES = 10
IDLE_DAYS_CHOICES = (1, 7, 30, 365, None)
CONFIRM_MINUTES_CHOICES = (10, 60, 1440, None)
SEEN_UPDATE_INTERVAL = timedelta(minutes=1)

LOGIN_WINDOW = timedelta(minutes=15)
MAX_FAILURES_PER_ACCOUNT = 5
MAX_FAILURES_PER_IP = 20

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_db(request: Request) -> Iterator[DbSession]:
    database: Database = request.app.state.database
    yield from database.sessions()


Db = Annotated[DbSession, Depends(get_db)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _require_client_header(request: Request) -> None:
    if request.method not in SAFE_METHODS and request.headers.get(CLIENT_HEADER) != CLIENT_HEADER_VALUE:
        raise forbidden("csrf")


@dataclass(frozen=True)
class SessionPolicy:
    # Sign out after this long without visiting the panel.
    idle: timedelta | None
    # Ask for the password again before sensitive actions after this long.
    confirm_after: timedelta | None


def session_policy(db: DbSession) -> SessionPolicy:
    stored = get_setting(db, SESSIONS_KEY)
    idle = stored.get("idleDays", DEFAULT_IDLE_DAYS)
    confirm = stored.get("confirmMinutes", DEFAULT_CONFIRM_MINUTES)
    return SessionPolicy(
        idle=timedelta(days=int(idle)) if idle is not None else None,
        confirm_after=timedelta(minutes=int(confirm)) if confirm is not None else None,
    )


def _load_session(request: Request, db: DbSession) -> Session | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    session = db.scalar(select(Session).where(Session.token_hash == hash_token(token)))
    now = utcnow()
    if session is None:
        return None
    idle = session_policy(db).idle
    if (
        session.expires_at <= now
        or (idle is not None and session.last_seen_at + idle <= now)
        or session.user.disabled
    ):
        db.delete(session)
        db.commit()
        return None
    if now - session.last_seen_at >= SEEN_UPDATE_INTERVAL:
        session.last_seen_at = now
        db.commit()
    return session


@dataclass
class Auth:
    session: Session
    user: User
    ip: str
    policy: SessionPolicy

    @property
    def is_admin(self) -> bool:
        return self.user.role == Role.ADMIN

    def can_read(self, repository: Repository) -> bool:
        return self.is_admin or any(member.user_id == self.user.id for member in repository.members)

    def can_write(self, repository: Repository) -> bool:
        return self.is_admin or (self.user.role == Role.MAINTAINER and self.can_read(repository))


def optional_session(request: Request, db: Db) -> Session | None:
    _require_client_header(request)
    return _load_session(request, db)


def require_pending_session(request: Request, db: Db) -> Session:
    _require_client_header(request)
    session = _load_session(request, db)
    if session is None:
        raise ApiError(401, "not_authenticated")
    return session


def require_auth(request: Request, db: Db) -> Auth:
    _require_client_header(request)
    session = _load_session(request, db)
    if session is None or not session.mfa_verified:
        raise ApiError(401, "not_authenticated")
    if request.method not in SAFE_METHODS:
        token = request.headers.get(CSRF_HEADER, "")
        if not tokens_equal(token, session.csrf_token):
            raise forbidden("csrf")
    return Auth(session=session, user=session.user, ip=client_ip(request), policy=session_policy(db))


CurrentAuth = Annotated[Auth, Depends(require_auth)]


def require_admin(auth: CurrentAuth) -> Auth:
    if not auth.is_admin:
        raise forbidden()
    return auth


AdminAuth = Annotated[Auth, Depends(require_admin)]


def require_recent_auth(auth: Auth) -> None:
    """Sensitive actions need a password typed recently, unless the administrators turned it off."""
    confirm_after = auth.policy.confirm_after
    if confirm_after is not None and utcnow() - auth.session.authenticated_at > confirm_after:
        raise ApiError(403, "reauthentication_required")


def repository_for(db: DbSession, auth: Auth, repository_id: int, *, write: bool = False) -> Repository:
    repository = db.get(Repository, repository_id)
    if repository is None or not auth.can_read(repository):
        raise ApiError(404, "repository_not_found")
    if write and not auth.can_write(repository):
        raise forbidden()
    return repository


def readable_repository_ids(db: DbSession, auth: Auth) -> list[int] | None:
    """None means every repository."""
    if auth.is_admin:
        return None
    return list(
        db.scalars(select(RepositoryMember.repository_id).where(RepositoryMember.user_id == auth.user.id))
    )


def check_login_allowed(db: DbSession, username: str, ip: str) -> None:
    since = utcnow() - LOGIN_WINDOW
    failures = (
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.at >= since, LoginAttempt.success.is_(False))
    )
    by_account = db.scalar(failures.where(LoginAttempt.username == username)) or 0
    by_ip = db.scalar(failures.where(LoginAttempt.ip == ip)) or 0
    if by_account >= MAX_FAILURES_PER_ACCOUNT or by_ip >= MAX_FAILURES_PER_IP:
        raise ApiError(429, "too_many_attempts", minutes=int(LOGIN_WINDOW.total_seconds() // 60))


def record_login_attempt(db: DbSession, username: str, ip: str, success: bool) -> None:
    db.add(LoginAttempt(username=username, ip=ip, success=success))
    if success:
        db.execute(
            delete(LoginAttempt).where(LoginAttempt.username == username, LoginAttempt.success.is_(False))
        )
    db.execute(delete(LoginAttempt).where(LoginAttempt.at < utcnow() - timedelta(days=30)))


def start_session(
    db: DbSession, request: Request, response: Response, settings: Settings, user: User, *, mfa_verified: bool
) -> Session:
    token = new_token()
    now = utcnow()
    session = Session(
        token_hash=hash_token(token),
        csrf_token=new_token(),
        user_id=user.id,
        mfa_verified=mfa_verified,
        created_at=now,
        authenticated_at=now,
        last_seen_at=now,
        expires_at=now + (COOKIE_LIFETIME if mfa_verified else PENDING_MFA_LIFETIME),
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent", "")[:512],
    )
    db.add(session)
    set_session_cookie(request, response, settings, token, now + COOKIE_LIFETIME)
    return session


def complete_mfa(session: Session) -> None:
    now = utcnow()
    session.mfa_verified = True
    session.authenticated_at = now
    session.expires_at = now + COOKIE_LIFETIME


def set_session_cookie(
    request: Request, response: Response, settings: Settings, token: str, expires_at: datetime
) -> None:
    secure = settings.secure_cookies == "always" or (
        settings.secure_cookies == "auto" and request.url.scheme == "https"
    )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        expires=expires_at,
        path="/admin",
        secure=secure,
        httponly=True,
        samesite="strict",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/admin")
