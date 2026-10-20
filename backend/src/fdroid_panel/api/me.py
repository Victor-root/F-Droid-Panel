from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from pydantic import Field
from sqlalchemy import delete, select

from .. import audit
from ..auth import CurrentAuth, Db, require_recent_auth
from ..errors import ApiError, invalid, not_found
from ..models import RecoveryCode, Session, ThemeMode, User, utcnow
from ..security import (
    RECOVERY_CODE_COUNT,
    hash_password,
    hash_token,
    new_code,
    new_totp_secret,
    totp_uri,
    verify_password,
    verify_totp,
)
from .schemas import ApiModel, MeOut, user_out
from .validation import DisplayName, NewPassword

router = APIRouter(prefix="/me", tags=["me"])

LANGUAGES = {"en", "fr"}


class PreferencesIn(ApiModel):
    display_name: DisplayName | None = None
    theme: ThemeMode | None = None
    # "" goes back to following the browser.
    language: str | None = Field(default=None, max_length=16)


class PasswordIn(ApiModel):
    current_password: str
    new_password: NewPassword


class SecondFactorSetupOut(ApiModel):
    secret: str
    uri: str


class CodeIn(ApiModel):
    code: str


class RecoveryCodesOut(ApiModel):
    codes: list[str]


class SessionOut(ApiModel):
    id: int
    created_at: datetime
    last_seen_at: datetime
    ip: str
    user_agent: str
    current: bool


def me_out(auth: CurrentAuth) -> MeOut:
    return MeOut.model_validate(
        {
            **user_out(auth.user).model_dump(),
            "theme": auth.user.theme,
            "language": auth.user.language,
            "csrf_token": auth.session.csrf_token,
        }
    )


def _new_recovery_codes(user: User) -> list[str]:
    codes = [new_code() for _ in range(RECOVERY_CODE_COUNT)]
    user.recovery_codes.clear()
    user.recovery_codes.extend(RecoveryCode(code_hash=hash_token(code)) for code in codes)
    return codes


@router.get("")
def get_me(auth: CurrentAuth) -> MeOut:
    return me_out(auth)


@router.patch("")
def update_me(body: PreferencesIn, db: Db, auth: CurrentAuth) -> MeOut:
    user = auth.user
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.theme is not None:
        user.theme = body.theme
    if body.language is not None:
        if body.language and body.language not in LANGUAGES:
            raise invalid("unsupported_language")
        user.language = body.language or None
    db.commit()
    return me_out(auth)


@router.post("/password", status_code=204)
def change_password(body: PasswordIn, db: Db, auth: CurrentAuth) -> None:
    user = auth.user
    if not verify_password(user.password_hash, body.current_password):
        raise ApiError(401, "invalid_credentials")
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = utcnow()
    db.execute(delete(Session).where(Session.user_id == user.id, Session.id != auth.session.id))
    audit.record(db, "user.password_changed", user=user, ip=auth.ip, target=user.username)
    db.commit()


@router.post("/second-factor/setup")
def setup_second_factor(db: Db, auth: CurrentAuth) -> SecondFactorSetupOut:
    user = auth.user
    if user.totp_enabled:
        raise invalid("second_factor_already_enabled")
    user.totp_secret = new_totp_secret()
    db.commit()
    return SecondFactorSetupOut(secret=user.totp_secret, uri=totp_uri(user.totp_secret, user.username))


@router.post("/second-factor/enable")
def enable_second_factor(body: CodeIn, db: Db, auth: CurrentAuth) -> RecoveryCodesOut:
    user = auth.user
    if user.totp_enabled or user.totp_secret is None:
        raise invalid("second_factor_not_started")
    if not verify_totp(user.totp_secret, body.code):
        raise invalid("invalid_second_factor")
    user.totp_enabled = True
    codes = _new_recovery_codes(user)
    audit.record(db, "user.second_factor_enabled", user=user, ip=auth.ip, target=user.username)
    db.commit()
    return RecoveryCodesOut(codes=codes)


@router.post("/second-factor/disable", status_code=204)
def disable_second_factor(db: Db, auth: CurrentAuth) -> None:
    require_recent_auth(auth)
    user = auth.user
    user.totp_enabled = False
    user.totp_secret = None
    user.recovery_codes.clear()
    audit.record(db, "user.second_factor_disabled", user=user, ip=auth.ip, target=user.username)
    db.commit()


@router.post("/recovery-codes")
def regenerate_recovery_codes(db: Db, auth: CurrentAuth) -> RecoveryCodesOut:
    require_recent_auth(auth)
    if not auth.user.totp_enabled:
        raise invalid("second_factor_not_enabled")
    codes = _new_recovery_codes(auth.user)
    audit.record(db, "user.recovery_codes_regenerated", user=auth.user, ip=auth.ip, target=auth.user.username)
    db.commit()
    return RecoveryCodesOut(codes=codes)


@router.get("/sessions")
def list_sessions(db: Db, auth: CurrentAuth) -> list[SessionOut]:
    sessions = db.scalars(
        select(Session)
        .where(Session.user_id == auth.user.id, Session.mfa_verified.is_(True))
        .order_by(Session.last_seen_at.desc())
    )
    return [
        SessionOut(
            id=s.id,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
            ip=s.ip,
            user_agent=s.user_agent,
            current=s.id == auth.session.id,
        )
        for s in sessions
    ]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: int, db: Db, auth: CurrentAuth) -> None:
    session = db.get(Session, session_id)
    if session is None or session.user_id != auth.user.id:
        raise not_found()
    db.delete(session)
    db.commit()
