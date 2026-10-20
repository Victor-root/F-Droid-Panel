from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from ..models import Role, ThemeMode, User


class ApiModel(BaseModel):
    """JSON uses camelCase, like the TypeScript side."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class UserOut(ApiModel):
    id: int
    username: str
    display_name: str
    role: Role
    disabled: bool
    totp_enabled: bool
    created_at: datetime
    last_login_at: datetime | None
    repository_ids: list[int]


class MeOut(UserOut):
    theme: ThemeMode
    language: str | None
    csrf_token: str


T = TypeVar("T")


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int


def user_out(user: User) -> UserOut:
    return UserOut.model_validate(
        {
            **{field: getattr(user, field) for field in UserOut.model_fields if field != "repository_ids"},
            "repository_ids": sorted(member.repository_id for member in user.memberships),
        }
    )
