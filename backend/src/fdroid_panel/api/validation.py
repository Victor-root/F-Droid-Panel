from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, StringConstraints

from ..security import MIN_PASSWORD_LENGTH

USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{1,31}$")


def _username(value: str) -> str:
    value = value.strip().lower()
    if not USERNAME_PATTERN.fullmatch(value):
        raise ValueError("invalid_username")
    return value


def _password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError("password_too_short")
    return value


Username = Annotated[str, AfterValidator(_username)]
NewPassword = Annotated[str, StringConstraints(max_length=1024), AfterValidator(_password)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
