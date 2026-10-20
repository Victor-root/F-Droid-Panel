from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select

from .. import audit
from ..auth import (
    CurrentAuth,
    Db,
    check_login_allowed,
    clear_session_cookie,
    client_ip,
    complete_mfa,
    get_settings,
    optional_session,
    record_login_attempt,
    require_pending_session,
    start_session,
)
from ..config import Settings
from ..errors import ApiError, invalid
from ..models import Role, Session, SetupCode, User, utcnow
from ..security import (
    hash_password,
    hash_token,
    normalize_code,
    password_needs_rehash,
    verify_password,
    verify_totp,
    waste_password_check,
)
from .schemas import ApiModel
from .validation import DisplayName, NewPassword, Username

router = APIRouter(prefix="/auth", tags=["auth"])


class StatusOut(ApiModel):
    setup_required: bool
    authenticated: bool
    second_factor_required: bool


class SetupIn(ApiModel):
    code: str
    username: Username
    display_name: DisplayName
    password: NewPassword


class LoginIn(ApiModel):
    username: str
    password: str


class LoginOut(ApiModel):
    second_factor_required: bool


class SecondFactorIn(ApiModel):
    code: str


class ConfirmIn(ApiModel):
    password: str


@router.get("/status")
def status(db: Db, session: Annotated[Session | None, Depends(optional_session)]) -> StatusOut:
    has_users = (db.scalar(select(func.count()).select_from(User)) or 0) > 0
    return StatusOut(
        setup_required=not has_users,
        authenticated=session is not None and session.mfa_verified,
        second_factor_required=session is not None and not session.mfa_verified,
    )


@router.post("/setup", dependencies=[Depends(optional_session)])
def setup(
    body: SetupIn,
    request: Request,
    response: Response,
    db: Db,
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginOut:
    """Creates an administrator with a one-time code printed by the installer or `fdroid-panel setup-code`."""
    ip = client_ip(request)
    check_login_allowed(db, "#setup", ip)
    code = db.scalar(select(SetupCode).where(SetupCode.code_hash == hash_token(normalize_code(body.code))))
    if code is None or code.used_at is not None or code.expires_at <= utcnow():
        record_login_attempt(db, "#setup", ip, success=False)
        db.commit()
        raise invalid("invalid_setup_code")
    if db.scalar(select(User).where(User.username == body.username)):
        raise invalid("username_taken")

    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=Role.ADMIN,
        last_login_at=utcnow(),
    )
    db.add(user)
    code.used_at = utcnow()
    db.flush()
    start_session(db, request, response, settings, user, mfa_verified=True)
    audit.record(db, "user.setup", user=user, ip=ip, target=user.username)
    db.commit()
    return LoginOut(second_factor_required=False)


@router.post("/login", dependencies=[Depends(optional_session)])
def login(
    body: LoginIn,
    request: Request,
    response: Response,
    db: Db,
    settings: Annotated[Settings, Depends(get_settings)],
) -> LoginOut:
    username = body.username.strip().lower()[:64]
    ip = client_ip(request)
    check_login_allowed(db, username, ip)

    user = db.scalar(select(User).where(User.username == username))
    if user is None:
        waste_password_check(body.password)
    if user is None or user.disabled or not verify_password(user.password_hash, body.password):
        record_login_attempt(db, username, ip, success=False)
        audit.record(db, "auth.login_failed", user=None, ip=ip, target=username)
        db.commit()
        raise ApiError(401, "invalid_credentials")

    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    start_session(db, request, response, settings, user, mfa_verified=not user.totp_enabled)
    if not user.totp_enabled:
        record_login_attempt(db, username, ip, success=True)
        user.last_login_at = utcnow()
        audit.record(db, "auth.login", user=user, ip=ip)
    db.commit()
    return LoginOut(second_factor_required=user.totp_enabled)


@router.post("/second-factor")
def second_factor(
    body: SecondFactorIn,
    request: Request,
    db: Db,
    session: Annotated[Session, Depends(require_pending_session)],
) -> LoginOut:
    user = session.user
    ip = client_ip(request)
    check_login_allowed(db, user.username, ip)
    if session.mfa_verified:
        return LoginOut(second_factor_required=False)

    used_recovery = False
    valid = user.totp_secret is not None and verify_totp(user.totp_secret, body.code)
    if not valid:
        code_hash = hash_token(normalize_code(body.code))
        recovery = next(
            (code for code in user.recovery_codes if code.used_at is None and code.code_hash == code_hash),
            None,
        )
        if recovery is not None:
            recovery.used_at = utcnow()
            valid = used_recovery = True
    if not valid:
        record_login_attempt(db, user.username, ip, success=False)
        audit.record(db, "auth.second_factor_failed", user=user, ip=ip)
        db.commit()
        raise ApiError(401, "invalid_second_factor")

    complete_mfa(session)
    record_login_attempt(db, user.username, ip, success=True)
    user.last_login_at = utcnow()
    audit.record(db, "auth.login", user=user, ip=ip, details={"recoveryCode": used_recovery})
    db.commit()
    return LoginOut(second_factor_required=False)


@router.post("/logout", status_code=204)
def logout(response: Response, db: Db, session: Annotated[Session | None, Depends(optional_session)]) -> None:
    if session is not None:
        db.delete(session)
        db.commit()
    clear_session_cookie(response)


@router.post("/confirm", status_code=204)
def confirm(body: ConfirmIn, db: Db, auth: CurrentAuth) -> None:
    """Typing the password again unlocks sensitive actions for a few minutes."""
    check_login_allowed(db, auth.user.username, auth.ip)
    if not verify_password(auth.user.password_hash, body.password):
        record_login_attempt(db, auth.user.username, auth.ip, success=False)
        db.commit()
        raise ApiError(401, "invalid_credentials")
    auth.session.authenticated_at = utcnow()
    db.commit()
