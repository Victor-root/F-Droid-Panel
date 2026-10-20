from __future__ import annotations

from fastapi import Request

from .. import apps as content
from ..errors import invalid

MAX_IMAGE_UPLOAD = content.MAX_IMAGE_BYTES + 1


async def read_image_body(request: Request) -> bytes:
    """The raw body of an image upload, refused as soon as it is too large."""
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_IMAGE_UPLOAD:
            raise invalid("image_too_large")
    return bytes(data)
