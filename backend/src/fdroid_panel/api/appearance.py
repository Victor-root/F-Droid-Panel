from __future__ import annotations

import re

from fastapi import APIRouter
from pydantic import field_validator

from .. import audit
from ..auth import AdminAuth, Db
from ..settings_store import get_setting, set_setting
from .schemas import ApiModel

router = APIRouter(prefix="/appearance", tags=["appearance"])

DEFAULT_ACCENT = "#3ddc84"
APPEARANCE_KEY = "appearance"


class AppearanceOut(ApiModel):
    accent: str

    @field_validator("accent")
    @classmethod
    def _hex(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("invalid_color")
        return value.lower()


@router.get("")
def get_appearance(db: Db) -> AppearanceOut:
    """Public: the login page is themed too."""
    return AppearanceOut(accent=get_setting(db, APPEARANCE_KEY).get("accent", DEFAULT_ACCENT))


@router.put("")
def set_appearance(body: AppearanceOut, db: Db, auth: AdminAuth) -> AppearanceOut:
    set_setting(db, APPEARANCE_KEY, {"accent": body.accent})
    audit.record(db, "settings.appearance", user=auth.user, ip=auth.ip, details={"accent": body.accent})
    db.commit()
    return body
