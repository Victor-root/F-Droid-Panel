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
import re
import sys
import xml.etree.ElementTree as ET
from typing import Any

ICON_MAX_BYTES = 512 * 1024
ICON_MAX_SIDE = 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# Android densities: 640 is xxxhdpi, 65534 anydpi (adaptive icons), 65535 nodpi.
BITMAP_MAX_DPI = 65533
NODPI = 65535
ANDROID = "{http://schemas.android.com/apk/res/android}"
SVG = "http://www.w3.org/2000/svg"
# The layers of an adaptive icon are 108 dp wide, launchers show the 72 dp in the middle.
ADAPTIVE_SIDE = 108
ADAPTIVE_VISIBLE = 72
DRAWABLE_MAX_BYTES = 256 * 1024
DRAWABLE_MAX_DEPTH = 8
# android.R.color.white, black and transparent: the framework colors icons use.
FRAMEWORK_COLORS = {0x0106000B: "#FFFFFFFF", 0x0106000C: "#FF000000", 0x0106000D: "#00000000"}
COLOR = re.compile(r"^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$")
NUMBER = re.compile(r"^-?[0-9.]+(?:[eE][-+]?[0-9]+)?")
PATH_DATA = re.compile(r"^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\-\s]*$")


class Unsupported(Exception):
    """A drawable the panel cannot draw: the bitmap icon is used instead."""


def load() -> tuple[Any, Any]:
    try:
        from loguru import logger

        logger.remove()
    except ImportError:
        pass
    logging.disable(logging.CRITICAL)
    try:
        from androguard.core.apk import APK
        from androguard.core.axml import AXMLPrinter
    except ImportError:
        from androguard.core.bytecodes.apk import APK
        from androguard.core.bytecodes.axml import AXMLPrinter
    return APK, AXMLPrinter


def png_icon(data: bytes) -> bytes | None:
    """The icon as PNG: F-Droid publishes PNG and JPEG graphics only, recent apps ship WebP icons."""
    if data.startswith(PNG_SIGNATURE):
        return data
    from PIL import Image

    try:
        with Image.open(io.BytesIO(data), formats=["WEBP", "JPEG"]) as image:
            if max(image.size) > ICON_MAX_SIDE:
                return None
            converted = io.BytesIO()
            image.save(converted, "PNG")
            return converted.getvalue()
    except (OSError, ValueError, Image.DecompressionBombError):
        return None


def number(value: str | None, default: float = 0.0) -> float:
    """A float of the compiled XML, which writes "108.000000dip" or "10.000003%"."""
    if value is None:
        return default
    match = NUMBER.match(value)
    if match is None:
        raise Unsupported(value)
    return float(match.group())


def paint(color: str) -> tuple[str, float]:
    """An Android color (#RGB, #ARGB, #RRGGBB, #AARRGGBB) as an SVG color and its opacity."""
    digits = color[1:]
    if len(digits) in (3, 4):
        digits = "".join(digit * 2 for digit in digits)
    if len(digits) == 6:
        digits = "FF" + digits
    return "#" + digits[2:], int(digits[:2], 16) / 255


class AdaptiveIcon:
    """Draws an adaptive icon as SVG: the panel renders it, fdroidserver only takes bitmaps."""

    def __init__(self, apk: Any, axml_printer: Any) -> None:
        self.apk = apk
        self.axml_printer = axml_printer
        self.resources = apk.get_android_resources()
        self.defs = ET.Element("defs")
        self.ids = 0

    def svg(self, reference: str) -> str:
        path = self.resolve(reference)
        if not path.endswith(".xml"):
            raise Unsupported(path)
        root = self.xml(path)
        if root.tag != "adaptive-icon":
            raise Unsupported(root.tag)
        offset = (ADAPTIVE_SIDE - ADAPTIVE_VISIBLE) / 2
        svg = ET.Element(
            "svg",
            xmlns=SVG,
            viewBox=f"{offset} {offset} {ADAPTIVE_VISIBLE} {ADAPTIVE_VISIBLE}",
            width=str(ADAPTIVE_VISIBLE),
            height=str(ADAPTIVE_VISIBLE),
        )
        svg.append(self.defs)
        box = (0.0, 0.0, float(ADAPTIVE_SIDE), float(ADAPTIVE_SIDE))
        for name in ("background", "foreground"):
            layer = root.find(name)
            if layer is not None:
                self.drawable(svg, layer, box, 0)
        return ET.tostring(svg, encoding="unicode")

    def xml(self, path: str) -> Any:
        data = self.apk.get_file(path)
        if not data or len(data) > DRAWABLE_MAX_BYTES:
            raise Unsupported(path)
        root = self.axml_printer(data).get_xml_obj()
        if root is None:
            raise Unsupported(path)
        return root

    def new_id(self) -> str:
        self.ids += 1
        return f"d{self.ids}"

    def resolve(self, value: str) -> str:
        """A reference (@7F080145) resolved to a color or to the file of the best configuration."""
        if COLOR.match(value):
            return value
        if value.startswith("@android:"):
            color = FRAMEWORK_COLORS.get(int(value[9:], 16))
            if color is None:
                raise Unsupported(value)
            return color
        if not value.startswith("@"):
            raise Unsupported(value)
        candidates = self.resources.get_resolved_res_configs(int(value[1:], 16))

        def rank(candidate: tuple[Any, Any]) -> tuple[bool, int]:
            density = candidate[0].get_density()
            # XML drawables (vectors, adaptive icons) win over the bitmaps kept for older Android.
            return str(candidate[1]).endswith(".xml"), density if density <= BITMAP_MAX_DPI else 0

        found = [
            candidate
            for candidate in candidates
            if isinstance(candidate[1], str) and "night" not in candidate[0].get_qualifier()
        ]
        if not found:
            raise Unsupported(value)
        resolved = str(max(found, key=rank)[1])
        if resolved.startswith("@"):
            return self.resolve(resolved)
        return resolved

    def drawable(
        self, parent: ET.Element, element: Any, box: tuple[float, float, float, float], depth: int
    ) -> None:
        """Draws the drawable of an attribute, or else of the first child, of element in box."""
        if depth > DRAWABLE_MAX_DEPTH:
            raise Unsupported("depth")
        reference = element.get(ANDROID + "drawable") or element.get(ANDROID + "src")
        if reference is not None:
            self.resource(parent, self.resolve(reference), box, depth)
            return
        children = list(element)
        if not children:
            raise Unsupported(element.tag)
        self.element(parent, children[0], box, depth)

    def resource(
        self, parent: ET.Element, value: str, box: tuple[float, float, float, float], depth: int
    ) -> None:
        x, y, width, height = box
        if COLOR.match(value):
            color, opacity = paint(value)
            ET.SubElement(
                parent, "rect", x=str(x), y=str(y), width=str(width), height=str(height), fill=color
            ).set("fill-opacity", str(opacity))
        elif value.endswith(".xml"):
            self.element(parent, self.xml(value), box, depth + 1)
        else:
            data = self.apk.get_file(value)
            png = png_icon(data) if data and len(data) <= ICON_MAX_BYTES else None
            if png is None:
                raise Unsupported(value)
            image = ET.SubElement(
                parent,
                "image",
                x=str(x),
                y=str(y),
                width=str(width),
                height=str(height),
                preserveAspectRatio="none",
                href="data:image/png;base64," + base64.b64encode(png).decode(),
            )
            image.set("image-rendering", "optimizeQuality")

    def element(
        self, parent: ET.Element, element: Any, box: tuple[float, float, float, float], depth: int
    ) -> None:
        x, y, width, height = box
        if element.tag == "vector":
            self.vector(parent, element, box)
        elif element.tag == "bitmap":
            self.drawable(parent, element, box, depth + 1)
        elif element.tag == "inset":
            sides = []
            for side, size in (("Left", width), ("Top", height), ("Right", width), ("Bottom", height)):
                value = element.get(ANDROID + f"inset{side}") or element.get(ANDROID + "inset")
                inset = number(value)
                sides.append(size * inset / 100 if value and value.endswith("%") else inset)
            left, top, right, bottom = sides
            inner = (x + left, y + top, width - left - right, height - top - bottom)
            self.drawable(parent, element, inner, depth + 1)
        elif element.tag == "layer-list":
            for item in element.findall("item"):
                left, top, right, bottom = (
                    number(item.get(ANDROID + side)) for side in ("left", "top", "right", "bottom")
                )
                inner = (x + left, y + top, width - left - right, height - top - bottom)
                self.drawable(parent, item, inner, depth + 1)
        elif element.tag == "shape":
            self.shape(parent, element, box)
        elif element.tag == "color":
            self.resource(parent, self.resolve(element.get(ANDROID + "color", "")), box, depth + 1)
        else:
            raise Unsupported(element.tag)

    def shape(self, parent: ET.Element, element: Any, box: tuple[float, float, float, float]) -> None:
        if element.get(ANDROID + "shape", "rectangle") not in ("rectangle", "0"):
            raise Unsupported("shape")
        x, y, width, height = box
        rect = ET.SubElement(parent, "rect", x=str(x), y=str(y), width=str(width), height=str(height))
        corners = element.find("corners")
        if corners is not None:
            rect.set("rx", str(number(corners.get(ANDROID + "radius"))))
        solid = element.find("solid")
        gradient = element.find("gradient")
        if solid is not None:
            color, opacity = paint(self.resolve(solid.get(ANDROID + "color", "")))
            rect.set("fill", color)
            rect.set("fill-opacity", str(opacity))
        elif gradient is not None:
            if gradient.get(ANDROID + "type", "linear") not in ("linear", "0"):
                raise Unsupported("gradient")
            angle = number(gradient.get(ANDROID + "angle"))
            # Android angles go counterclockwise from left to right, in steps of 45 degrees.
            directions = {
                0: (0, 0.5, 1, 0.5),
                45: (0, 1, 1, 0),
                90: (0.5, 1, 0.5, 0),
                135: (1, 1, 0, 0),
                180: (1, 0.5, 0, 0.5),
                225: (1, 0, 0, 1),
                270: (0.5, 0, 0.5, 1),
                315: (0, 0, 1, 1),
            }
            x1, y1, x2, y2 = directions.get(int(angle) % 360, directions[0])
            identifier = self.gradient(
                gradient, "linearGradient", {"x1": x1, "y1": y1, "x2": x2, "y2": y2}, "objectBoundingBox"
            )
            rect.set("fill", f"url(#{identifier})")
        else:
            rect.set("fill", "none")

    def gradient(self, element: Any, kind: str, geometry: dict[str, float], units: str) -> str:
        identifier = self.new_id()
        gradient = ET.SubElement(self.defs, kind, id=identifier, gradientUnits=units)
        for name, value in geometry.items():
            gradient.set(name, str(value))
        tile = element.get(ANDROID + "tileMode")
        if tile in ("repeat", "1"):
            gradient.set("spreadMethod", "repeat")
        elif tile in ("mirror", "2"):
            gradient.set("spreadMethod", "reflect")
        items = element.findall("item")
        if items:
            stops = [
                (number(item.get(ANDROID + "offset")), item.get(ANDROID + "color", "")) for item in items
            ]
        else:
            colors = [element.get(ANDROID + name) for name in ("startColor", "centerColor", "endColor")]
            present = [color for color in colors if color is not None]
            stops = [(index / max(len(present) - 1, 1), color) for index, color in enumerate(present)]
        for offset, value in stops:
            color, opacity = paint(self.resolve(value))
            stop = ET.SubElement(gradient, "stop", offset=str(offset))
            stop.set("stop-color", color)
            stop.set("stop-opacity", str(opacity))
        return identifier

    def vector(self, parent: ET.Element, element: Any, box: tuple[float, float, float, float]) -> None:
        x, y, width, height = box
        viewport = ET.SubElement(
            parent,
            "svg",
            x=str(x),
            y=str(y),
            width=str(width),
            height=str(height),
            viewBox=f"0 0 {number(element.get(ANDROID + 'viewportWidth'))} "
            f"{number(element.get(ANDROID + 'viewportHeight'))}",
            preserveAspectRatio="none",
        )
        content = ET.SubElement(viewport, "g", opacity=str(number(element.get(ANDROID + "alpha"), 1)))
        tint = element.get(ANDROID + "tint")
        if tint is None:
            self.children(content, element)
            return
        # The default tint mode, src_in: the tint color where the vector draws.
        mask = ET.SubElement(self.defs, "mask", id=self.new_id(), maskUnits="userSpaceOnUse")
        mask.set("mask-type", "alpha")
        self.children(ET.SubElement(mask, "g"), element)
        color, opacity = paint(self.resolve(tint))
        rect = ET.SubElement(
            content, "rect", width="100%", height="100%", fill=color, mask=f"url(#{mask.get('id')})"
        )
        rect.set("fill-opacity", str(opacity))

    def children(self, parent: ET.Element, element: Any) -> None:
        """Paths and groups; a clip-path clips the elements after it in the same group."""
        for child in element:
            if child.tag == "group":
                pivot_x, pivot_y = (
                    number(child.get(ANDROID + "pivotX")),
                    number(child.get(ANDROID + "pivotY")),
                )
                move_x = number(child.get(ANDROID + "translateX")) + pivot_x
                move_y = number(child.get(ANDROID + "translateY")) + pivot_y
                rotation = number(child.get(ANDROID + "rotation"))
                scale_x, scale_y = (
                    number(child.get(ANDROID + "scaleX"), 1),
                    number(child.get(ANDROID + "scaleY"), 1),
                )
                group = ET.SubElement(parent, "g")
                # The order of VectorDrawable: around the pivot, scaled, rotated, then moved.
                group.set(
                    "transform",
                    f"translate({move_x} {move_y}) rotate({rotation}) scale({scale_x} {scale_y}) "
                    f"translate({-pivot_x} {-pivot_y})",
                )
                self.children(group, child)
            elif child.tag == "clip-path":
                clip = ET.SubElement(self.defs, "clipPath", id=self.new_id())
                ET.SubElement(clip, "path", d=self.path_data(child))
                parent = ET.SubElement(parent, "g")
                parent.set("clip-path", f"url(#{clip.get('id')})")
            elif child.tag == "path":
                self.path(parent, child)
            else:
                raise Unsupported(child.tag)

    def path_data(self, element: Any) -> str:
        data = str(element.get(ANDROID + "pathData", ""))
        if not PATH_DATA.match(data):
            raise Unsupported("pathData")
        return data

    def path(self, parent: ET.Element, element: Any) -> None:
        trim = (
            number(element.get(ANDROID + "trimPathStart")),
            number(element.get(ANDROID + "trimPathEnd"), 1),
            number(element.get(ANDROID + "trimPathOffset")),
        )
        if trim != (0, 1, 0):
            raise Unsupported("trimPath")
        path = ET.SubElement(parent, "path", d=self.path_data(element))
        path.set(
            "fill-rule", "evenodd" if element.get(ANDROID + "fillType") in ("evenOdd", "1") else "nonzero"
        )
        for kind in ("fill", "stroke"):
            value = element.get(ANDROID + f"{kind}Color")
            alpha = number(element.get(ANDROID + f"{kind}Alpha"), 1)
            if value is None:
                path.set(kind, "none")
                continue
            resolved = self.resolve(value)
            if COLOR.match(resolved):
                color, opacity = paint(resolved)
                path.set(kind, color)
                path.set(f"{kind}-opacity", str(opacity * alpha))
            else:
                path.set(kind, f"url(#{self.vector_gradient(self.xml(resolved))})")
                path.set(f"{kind}-opacity", str(alpha))
        path.set("stroke-width", str(number(element.get(ANDROID + "strokeWidth"))))
        caps = {"0": "butt", "1": "round", "2": "square"}
        joins = {"0": "miter", "1": "round", "2": "bevel"}
        cap = element.get(ANDROID + "strokeLineCap", "butt")
        join = element.get(ANDROID + "strokeLineJoin", "miter")
        path.set("stroke-linecap", caps.get(cap, cap))
        path.set("stroke-linejoin", joins.get(join, join))
        path.set("stroke-miterlimit", str(number(element.get(ANDROID + "strokeMiterLimit"), 4)))

    def vector_gradient(self, element: Any) -> str:
        """A gradient of a vector path, in the coordinates of the viewport."""
        if element.tag != "gradient":
            raise Unsupported(element.tag)
        kind = element.get(ANDROID + "type", "linear")
        if kind in ("linear", "0"):
            geometry = {
                "x1": number(element.get(ANDROID + "startX")),
                "y1": number(element.get(ANDROID + "startY")),
                "x2": number(element.get(ANDROID + "endX")),
                "y2": number(element.get(ANDROID + "endY")),
            }
            return self.gradient(element, "linearGradient", geometry, "userSpaceOnUse")
        if kind in ("radial", "1"):
            geometry = {
                "cx": number(element.get(ANDROID + "centerX")),
                "cy": number(element.get(ANDROID + "centerY")),
                "r": number(element.get(ANDROID + "gradientRadius")),
            }
            return self.gradient(element, "radialGradient", geometry, "userSpaceOnUse")
        raise Unsupported(kind)


def bitmap_icon(apk: Any) -> str | None:
    """The sharpest bitmap of the launcher icon, from the density folders, then from nodpi."""
    for max_dpi in (BITMAP_MAX_DPI, NODPI):
        icon_path = apk.get_app_icon(max_dpi=max_dpi)
        if icon_path and icon_path.endswith((".png", ".webp")):
            data = apk.get_file(icon_path)
            png = png_icon(data) if data and len(data) <= ICON_MAX_BYTES else None
            if png is not None:
                return base64.b64encode(png).decode()
    return None


def adaptive_icon(apk: Any, axml_printer: Any) -> str | None:
    """The adaptive icon (Android 8 and newer) as SVG, None when the app has none the panel can draw."""
    reference = apk.get_attribute_value("application", "icon")
    if not reference:
        return None
    try:
        return AdaptiveIcon(apk, axml_printer).svg(reference)
    except (Unsupported, ValueError, KeyError):
        return None


def inspect(apk_class: Any, axml_printer: Any, path: str) -> dict[str, Any]:
    apk = apk_class(path)

    def integer(value: Any) -> int | None:
        try:
            return int(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    return {
        "package": apk.get_package(),
        "versionCode": integer(apk.get_androidversion_code()),
        "versionName": apk.get_androidversion_name(),
        "minSdk": integer(apk.get_min_sdk_version()),
        "targetSdk": integer(apk.get_target_sdk_version()),
        "maxSdk": integer(apk.get_max_sdk_version()),
        "permissions": sorted(set(apk.get_permissions())),
        "label": apk.get_app_name() or None,
        "icon": bitmap_icon(apk),
        "adaptiveIcon": adaptive_icon(apk, axml_printer),
        "nativeCode": sorted(set(apk.get_libraries() or [])) if hasattr(apk, "get_libraries") else [],
    }


def main() -> None:
    apk_class, axml_printer = load()
    for path in sys.argv[1:]:
        try:
            result = {"path": path, "ok": True, **inspect(apk_class, axml_printer, path)}
        except Exception as error:  # every problem is reported, the next APK is still read
            result = {"path": path, "ok": False, "error": type(error).__name__}
        sys.stdout.write(json.dumps(result) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
