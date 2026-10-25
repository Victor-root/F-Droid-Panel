from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import APIRouter
from pydantic import Field
from sqlalchemy import select

from .. import audit
from ..auth import KEY_PREFIX, CurrentAuth, Db, repository_for, require_recent_auth
from ..errors import not_found
from ..models import UploadKey
from ..security import hash_token
from .schemas import ApiModel

router = APIRouter(prefix="/repositories/{repository_id}/keys", tags=["keys"])


class UploadKeyIn(ApiModel):
    name: str = Field(min_length=1, max_length=128)
    can_publish: bool = False


class UploadKeyOut(ApiModel):
    id: int
    name: str
    hint: str
    can_publish: bool
    username: str
    created_at: datetime
    last_used_at: datetime | None


class UploadKeyCreatedOut(UploadKeyOut):
    # Shown once: only its hash is kept.
    key: str


def _key_out(key: UploadKey) -> UploadKeyOut:
    return UploadKeyOut(
        id=key.id,
        name=key.name,
        hint=key.hint,
        can_publish=key.can_publish,
        username=key.user.username,
        created_at=key.created_at,
        last_used_at=key.last_used_at,
    )


@router.get("")
def list_keys(repository_id: int, db: Db, auth: CurrentAuth) -> list[UploadKeyOut]:
    repository = repository_for(db, auth, repository_id, write=True)
    keys = db.scalars(
        select(UploadKey).where(UploadKey.repository_id == repository.id).order_by(UploadKey.id)
    )
    return [_key_out(key) for key in keys]


@router.post("", status_code=201)
def create_key(repository_id: int, body: UploadKeyIn, db: Db, auth: CurrentAuth) -> UploadKeyCreatedOut:
    require_recent_auth(auth)
    repository = repository_for(db, auth, repository_id, write=True)
    token = KEY_PREFIX + secrets.token_urlsafe(32)
    key = UploadKey(
        repository_id=repository.id,
        name=body.name,
        key_hash=hash_token(token),
        hint=token[-4:],
        can_publish=body.can_publish,
        user_id=auth.user.id,
    )
    db.add(key)
    db.flush()
    audit.record(
        db,
        "key.created",
        user=auth.user,
        ip=auth.ip,
        repository_id=repository.id,
        target=body.name,
        details={"canPublish": body.can_publish},
    )
    db.commit()
    return UploadKeyCreatedOut(**_key_out(key).model_dump(), key=token)


@router.delete("/{key_id}", status_code=204)
def delete_key(repository_id: int, key_id: int, db: Db, auth: CurrentAuth) -> None:
    repository = repository_for(db, auth, repository_id, write=True)
    key = db.get(UploadKey, key_id)
    if key is None or key.repository_id != repository.id:
        raise not_found("key_not_found")
    audit.record(db, "key.deleted", user=auth.user, ip=auth.ip, repository_id=repository.id, target=key.name)
    db.delete(key)
    db.commit()
