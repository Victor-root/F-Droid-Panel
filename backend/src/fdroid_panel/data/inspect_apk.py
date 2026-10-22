"""Reads APK manifests with the androguard of an fdroidserver installation.

Run with the Python of fdroidserver (the panel does not depend on androguard itself),
in its own process, because the APKs come from uploads and are not trusted:
    python inspect_apk.py FILE.apk [FILE.apk ...]
Prints one JSON object per line.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import sys
from typing import Any

ICON_MAX_BYTES = 512 * 1024
ICON_MAX_SIDE = 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# Android densities: 640 is xxxhdpi, 65534 anydpi (adaptive icons), 65535 nodpi.
BITMAP_MAX_DPI = 65533
NODPI = 65535


def load() -> Any:
    try:
        from loguru import logger

        logger.remove()
    except ImportError:
        pass
    logging.disable(logging.CRITICAL)
    try:
        from androguard.core.apk import APK
    except ImportError:
        from androguard.core.bytecodes.apk import APK
    return APK


def png_icon(data: bytes) -> bytes | None:
    """The icon as PNG: F-Droid publishes PNG and JPEG graphics only, recent apps ship WebP icons."""
    if data.startswith(PNG_SIGNATURE):
        return data
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data), formats=["WEBP"]) as image:
            if max(image.size) > ICON_MAX_SIDE:
                return None
            converted = io.BytesIO()
            image.save(converted, "PNG")
            return converted.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError):
        return None


def inspect(apk_class: Any, path: str) -> dict[str, Any]:
    apk = apk_class(path)
    icon = None
    # Adaptive icons (anydpi XML, drawn by the launcher) cannot be shown as images: the sharpest
    # bitmap is taken instead, from the density folders, then from nodpi.
    for max_dpi in (BITMAP_MAX_DPI, NODPI):
        icon_path = apk.get_app_icon(max_dpi=max_dpi)
        if icon_path and icon_path.endswith((".png", ".webp")):
            data = apk.get_file(icon_path)
            png = png_icon(data) if data and len(data) <= ICON_MAX_BYTES else None
            if png is not None:
                icon = base64.b64encode(png).decode()
                break

    def number(value: Any) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    return {
        "package": apk.get_package(),
        "versionCode": number(apk.get_androidversion_code()),
        "versionName": apk.get_androidversion_name(),
        "minSdk": number(apk.get_min_sdk_version()),
        "targetSdk": number(apk.get_target_sdk_version()),
        "maxSdk": number(apk.get_max_sdk_version()),
        "permissions": sorted(set(apk.get_permissions())),
        "label": apk.get_app_name() or None,
        "icon": icon,
        "nativeCode": sorted(set(apk.get_libraries() or [])) if hasattr(apk, "get_libraries") else [],
    }


def main() -> None:
    apk_class = load()
    for path in sys.argv[1:]:
        try:
            result = {"path": path, "ok": True, **inspect(apk_class, path)}
        except Exception as error:  # every problem is reported, the next APK is still read
            result = {"path": path, "ok": False, "error": type(error).__name__}
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
