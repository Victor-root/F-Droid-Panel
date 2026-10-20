from __future__ import annotations

from fastapi import APIRouter
from pydantic import Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session as DbSession

from .. import audit
from ..auth import AdminAuth, Db, require_recent_auth
from ..errors import invalid, not_found
from ..models import Repository, RepositoryMember, Role, Session, User, utcnow
from ..security import hash_password
from .schemas import ApiModel, UserOut, user_out
from .validation import DisplayName, NewPassword, Username

router = APIRouter(prefix="/users", tags=["users"])


class UserCreateIn(ApiModel):
    username: Username
    display_name: DisplayName
    role: Role
    password: NewPassword
    repository_ids: list[int] = Field(default_factory=list)


class UserUpdateIn(ApiModel):
    display_name: DisplayName | None = None
    role: Role | None = None
    disabled: bool | None = None
    repository_ids: list[int] | None = None


class PasswordResetIn(ApiModel):
    password: NewPassword


def _get_user(db: DbSession, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("user_not_found")
    return user


def _active_admins(db: DbSession) -> int:
    return (
        db.scalar(
            select(func.count()).select_from(User).where(User.role == Role.ADMIN, User.disabled.is_(False))
        )
        or 0
    )


def _set_repositories(db: DbSession, user: User, repository_ids: list[int]) -> None:
    existing = set(db.scalars(select(Repository.id).where(Repository.id.in_(repository_ids))))
    if existing != set(repository_ids):
        raise invalid("repository_not_found")
    user.memberships.clear()
    user.memberships.extend(
        RepositoryMember(repository_id=repository_id) for repository_id in sorted(existing)
    )


@router.get("")
def list_users(db: Db, auth: AdminAuth) -> list[UserOut]:
    del auth
    return [user_out(user) for user in db.scalars(select(User).order_by(User.username))]


@router.post("", status_code=201)
def create_user(body: UserCreateIn, db: Db, auth: AdminAuth) -> UserOut:
    require_recent_auth(auth)
    if db.scalar(select(User).where(User.username == body.username)):
        raise invalid("username_taken")
    user = User(
        username=body.username,
        display_name=body.display_name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    _set_repositories(db, user, body.repository_ids)
    db.flush()
    audit.record(
        db,
        "user.created",
        user=auth.user,
        ip=auth.ip,
        target=user.username,
        details={"role": user.role.value},
    )
    db.commit()
    return user_out(user)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdateIn, db: Db, auth: AdminAuth) -> UserOut:
    require_recent_auth(auth)
    user = _get_user(db, user_id)
    losing_admin = (
        user.role == Role.ADMIN
        and not user.disabled
        and ((body.role is not None and body.role != Role.ADMIN) or body.disabled is True)
    )
    if losing_admin and _active_admins(db) <= 1:
        raise invalid("last_admin")
    if body.disabled and user.id == auth.user.id:
        raise invalid("cannot_disable_self")

    changes = body.model_dump(exclude_none=True, by_alias=True)
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        user.role = body.role
    if body.disabled is not None:
        user.disabled = body.disabled
        if body.disabled:
            db.execute(delete(Session).where(Session.user_id == user.id))
    if body.repository_ids is not None:
        _set_repositories(db, user, body.repository_ids)
    audit.record(db, "user.updated", user=auth.user, ip=auth.ip, target=user.username, details=changes)
    db.commit()
    return user_out(user)


@router.post("/{user_id}/password", status_code=204)
def reset_password(user_id: int, body: PasswordResetIn, db: Db, auth: AdminAuth) -> None:
    require_recent_auth(auth)
    user = _get_user(db, user_id)
    user.password_hash = hash_password(body.password)
    user.password_changed_at = utcnow()
    db.execute(delete(Session).where(Session.user_id == user.id, Session.id != auth.session.id))
    audit.record(db, "user.password_reset", user=auth.user, ip=auth.ip, target=user.username)
    db.commit()


@router.delete("/{user_id}/second-factor", status_code=204)
def reset_second_factor(user_id: int, db: Db, auth: AdminAuth) -> None:
    require_recent_auth(auth)
    user = _get_user(db, user_id)
    user.totp_enabled = False
    user.totp_secret = None
    user.recovery_codes.clear()
    audit.record(db, "user.second_factor_reset", user=auth.user, ip=auth.ip, target=user.username)
    db.commit()


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Db, auth: AdminAuth) -> None:
    require_recent_auth(auth)
    user = _get_user(db, user_id)
    if user.id == auth.user.id:
        raise invalid("cannot_delete_self")
    if user.role == Role.ADMIN and not user.disabled and _active_admins(db) <= 1:
        raise invalid("last_admin")
    audit.record(db, "user.deleted", user=auth.user, ip=auth.ip, target=user.username)
    db.delete(user)
    db.commit()
