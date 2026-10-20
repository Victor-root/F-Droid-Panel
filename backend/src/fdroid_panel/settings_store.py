from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from .models import Setting


def get_setting(db: Session, key: str) -> dict[str, Any]:
    setting = db.get(Setting, key)
    return dict(setting.value) if setting else {}


def set_setting(db: Session, key: str, value: dict[str, Any]) -> None:
    setting = db.get(Setting, key)
    if setting is None:
        db.add(Setting(key=key, value=value))
    else:
        setting.value = value
