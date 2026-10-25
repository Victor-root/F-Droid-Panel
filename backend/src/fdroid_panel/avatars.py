"""Profile pictures of the panel accounts, kept as files in the data directory."""

from __future__ import annotations

import hashlib
from pathlib import Path

from . import apps as content
from .files import write_atomic

MAX_AVATAR_BYTES = 1024 * 1024
MAX_AVATAR_SIDE = 1024
EXTENSIONS = (".png", ".jpg")


def avatar_path(directory: Path, user_id: int) -> Path | None:
    candidates = (directory / f"{user_id}{extension}" for extension in EXTENSIONS)
    return next((path for path in candidates if path.is_file()), None)


def remove(directory: Path, user_id: int) -> None:
    for extension in EXTENSIONS:
        (directory / f"{user_id}{extension}").unlink(missing_ok=True)


def save(directory: Path, user_id: int, data: bytes) -> str:
    """Replaces the picture of an account with a PNG or JPEG image; returns its SHA-256."""
    if len(data) > MAX_AVATAR_BYTES:
        raise content.InvalidInput("image_too_large")
    extension, width, height = content.image_dimensions(data)
    if not (0 < width <= MAX_AVATAR_SIDE and 0 < height <= MAX_AVATAR_SIDE):
        raise content.InvalidInput("unsupported_image")
    remove(directory, user_id)
    write_atomic(directory / f"{user_id}{extension}", data, mode=0o600)
    return hashlib.sha256(data).hexdigest()
