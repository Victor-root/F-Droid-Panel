"""Apps of a repository, read from and written to the files fdroidserver uses.

Published versions come from the signed index (index-v2.json); APK files the index
does not list yet are inspected and kept in a cache. App texts live in the locale
files of metadata/<appid>/<locale>/ (see docs/research/phase-0.md, section 7).
"""

from __future__ import annotations

import json
import re
import struct
from dataclasses import dataclass, field
from datetime import datetime, timezone
from importlib import resources
from pathlib import Path
from typing import Any

from . import yamlfile
from .files import resolve_inside, write_atomic

DEFAULT_LOCALE = "en-US"
# The categories of F-Droid (config/categories.yml of fdroiddata), named in English by their id.
OFFICIAL_CATEGORIES: dict[str, dict[str, str]] = {
    key: {DEFAULT_LOCALE: key, "fr": name}
    for key, name in json.loads(
        resources.files("fdroid_panel").joinpath("data/categories.json").read_text(encoding="utf-8")
    ).items()
}
OFFICIAL_CATEGORY_LOCALES = {"fr"}
SECTIONS = ("repo", "archive")
TEXT_FILES = {"name": "name.txt", "summary": "summary.txt", "description": "description.txt"}
# Texts in metadata/<appid>.yml replace the same field in every locale.
LEGACY_TEXT_FIELDS = {"name": "Name", "summary": "Summary", "description": "Description"}
GRAPHICS = ("icon", "featureGraphic", "promoGraphic", "tvBanner")
SCREENSHOT_TYPES = (
    "phoneScreenshots",
    "sevenInchScreenshots",
    "tenInchScreenshots",
    "tvScreenshots",
    "wearScreenshots",
)
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg")
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_SIDE = 8192
SUMMARY_MAX = 80
NAME_MAX = 50
DESCRIPTION_MAX = 4000
# Metadata fields the panel edits, with their type in metadata/<appid>.yml.
TEXT_FIELDS = (
    "AuthorName",
    "AuthorEmail",
    "AuthorWebSite",
    "WebSite",
    "SourceCode",
    "IssueTracker",
    "Translation",
    "Changelog",
    "Donate",
    "License",
)
LIST_FIELDS = ("Categories", "AntiFeatures")
PACKAGE_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$")
LOCALE_PATTERN = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
# The anti-features F-Droid clients know.
ANTI_FEATURES = (
    "Ads",
    "DisabledAlgorithm",
    "KnownVuln",
    "NoSourceSince",
    "NonFreeAdd",
    "NonFreeAssets",
    "NonFreeDep",
    "NonFreeNet",
    "NSFW",
    "Tracking",
    "TetheredNet",
    "UpstreamNonFree",
)


class InvalidInput(ValueError):
    """A value the user can fix; the message is an error code."""


def check_package(package: str) -> str:
    if not PACKAGE_PATTERN.fullmatch(package):
        raise InvalidInput("invalid_package")
    return package


def check_locale(locale: str) -> str:
    if not LOCALE_PATTERN.fullmatch(locale):
        raise InvalidInput("invalid_locale")
    return locale


@dataclass
class Version:
    version_code: int
    version_name: str | None
    file: str
    section: str
    size: int
    sha256: str | None
    added: datetime | None
    min_sdk: int | None
    target_sdk: int | None
    signer: str | None
    permissions: list[str]
    published: bool


@dataclass
class App:
    package: str
    metadata: dict[str, Any] = field(default_factory=dict)
    index: dict[str, Any] = field(default_factory=dict)
    versions: list[Version] = field(default_factory=list)
    label: str | None = None

    @property
    def latest(self) -> Version | None:
        return max(self.versions, key=lambda version: version.version_code, default=None)


def _localized(value: Any, preferred: str) -> str | None:
    if isinstance(value, dict) and value:
        for locale in (preferred, preferred.split("-")[0], DEFAULT_LOCALE, "en"):
            if locale in value:
                return str(value[locale])
        return str(next(iter(value.values())))
    return str(value) if value else None


def read_index(repository: Path) -> dict[str, tuple[dict[str, Any], list[Version]]]:
    """Packages of the published index, repo and archive together."""
    packages: dict[str, tuple[dict[str, Any], list[Version]]] = {}
    for section in SECTIONS:
        index = repository / section / "index-v2.json"
        if not index.is_file():
            continue
        data = json.loads(index.read_text(encoding="utf-8"))
        for package, details in data.get("packages", {}).items():
            _, versions = packages.setdefault(package, (details.get("metadata", {}), []))
            for entry in details.get("versions", {}).values():
                manifest, file = entry.get("manifest", {}), entry.get("file", {})
                added = entry.get("added")
                versions.append(
                    Version(
                        version_code=manifest.get("versionCode", 0),
                        version_name=manifest.get("versionName"),
                        file=Path(file.get("name", "")).name,
                        section=section,
                        size=file.get("size", 0),
                        sha256=file.get("sha256"),
                        added=datetime.fromtimestamp(added / 1000, tz=timezone.utc) if added else None,
                        min_sdk=manifest.get("usesSdk", {}).get("minSdkVersion"),
                        target_sdk=manifest.get("usesSdk", {}).get("targetSdkVersion"),
                        signer=(manifest.get("signer", {}).get("sha256") or [None])[0],
                        permissions=sorted(item["name"] for item in manifest.get("usesPermission", [])),
                        published=True,
                    )
                )
    return packages


def apk_files(repository: Path) -> list[str]:
    """Every APK file of the repository, as paths relative to it."""
    return sorted(
        str(path.relative_to(repository))
        for section in SECTIONS
        for path in (repository / section).glob("*.apk")
    )


def read_metadata(repository: Path, package: str) -> dict[str, Any]:
    path = repository / "metadata" / f"{package}.yml"
    return dict(yamlfile.load(path)) if path.is_file() else {}


def metadata_packages(repository: Path) -> list[str]:
    return sorted(
        path.stem for path in (repository / "metadata").glob("*.yml") if PACKAGE_PATTERN.fullmatch(path.stem)
    )


def locale_dir(repository: Path, package: str, locale: str) -> Path:
    return resolve_inside(repository / "metadata", f"{check_package(package)}/{check_locale(locale)}")


def locales(repository: Path, package: str) -> list[str]:
    base = repository / "metadata" / package
    if not base.is_dir():
        return []
    return sorted(
        path.name for path in base.iterdir() if path.is_dir() and LOCALE_PATTERN.fullmatch(path.name)
    )


def read_texts(repository: Path, package: str, locale: str) -> dict[str, str]:
    directory = locale_dir(repository, package, locale)
    texts = {}
    for key, name in TEXT_FILES.items():
        path = directory / name
        if path.is_file():
            texts[key] = (
                path.read_text(encoding="utf-8").strip()
                if key != "description"
                else path.read_text(encoding="utf-8")
            )
    return texts


def legacy_texts(metadata: dict[str, Any]) -> dict[str, str]:
    return {key: str(metadata[field]) for key, field in LEGACY_TEXT_FIELDS.items() if metadata.get(field)}


def display_texts(repository: Path, app: App, language: str) -> dict[str, str | None]:
    """Name and summary to show in lists: the panel language first, then English, then anything."""
    found: dict[str, str | None] = {"name": None, "summary": None}
    legacy = legacy_texts(app.metadata)
    available = locales(repository, app.package)
    order = [
        locale
        for wanted in (language, DEFAULT_LOCALE, "en")
        for locale in available
        if locale == wanted or locale.split("-")[0] == wanted.split("-")[0]
    ] + available
    for key in found:
        if key in legacy:
            found[key] = legacy[key]
            continue
        for locale in order:
            value = read_texts(repository, app.package, locale).get(key)
            if value:
                found[key] = value
                break
        if found[key] is None:
            found[key] = _localized(app.index.get(key), language)
    found["name"] = found["name"] or app.label or app.package
    return found


def write_texts(repository: Path, package: str, locale: str, texts: dict[str, str]) -> None:
    """Writes the texts of one language; texts found in the YAML file move to the default language first."""
    for key, limit in (("name", NAME_MAX), ("summary", SUMMARY_MAX), ("description", DESCRIPTION_MAX)):
        if len(texts.get(key, "")) > limit:
            raise InvalidInput(f"{key}_too_long")
    migrate_legacy_texts(repository, package)
    directory = locale_dir(repository, package, locale)
    directory.mkdir(parents=True, exist_ok=True)
    for key, name in TEXT_FILES.items():
        value = texts.get(key, "").strip()
        path = directory / name
        if value:
            # Names and summaries are stripped by fdroidserver; descriptions are published as written.
            write_atomic(path, (value + ("\n" if key != "description" else "")).encode("utf-8"))
        else:
            path.unlink(missing_ok=True)


def migrate_legacy_texts(repository: Path, package: str) -> bool:
    metadata_path = repository / "metadata" / f"{package}.yml"
    legacy = legacy_texts(read_metadata(repository, package))
    if not legacy:
        return False
    directory = locale_dir(repository, package, DEFAULT_LOCALE)
    directory.mkdir(parents=True, exist_ok=True)
    for key, value in legacy.items():
        path = directory / TEXT_FILES[key]
        if not path.exists():
            write_atomic(path, (value.strip() + ("\n" if key != "description" else "")).encode("utf-8"))
    yamlfile.update(metadata_path, {field: yamlfile.DELETE for field in LEGACY_TEXT_FIELDS.values()})
    return True


def update_metadata(repository: Path, package: str, values: dict[str, Any]) -> None:
    changes: dict[str, Any] = {}
    for key, value in values.items():
        if key in TEXT_FIELDS:
            changes[key] = str(value).strip() or yamlfile.DELETE
        elif key == "Categories":
            categories = [str(item).strip() for item in value if str(item).strip()]
            changes[key] = categories or yamlfile.DELETE
        elif key == "AntiFeatures":
            unknown = [item for item in value if item not in ANTI_FEATURES]
            if unknown:
                raise InvalidInput("invalid_anti_feature")
            changes[key] = list(value) or yamlfile.DELETE
        else:
            raise InvalidInput("invalid_field")
    yamlfile.update(repository / "metadata" / f"{check_package(package)}.yml", changes)


def create_metadata(repository: Path, package: str, signer: str | None, categories: list[str]) -> None:
    """Metadata of an app added through the panel, with its signing key pinned (see research, section 4)."""
    values: dict[str, Any] = {"Categories": categories or ["Other"]}
    if signer:
        values["AllowedAPKSigningKeys"] = signer
    yamlfile.update(repository / "metadata" / f"{check_package(package)}.yml", values)


def image_dimensions(data: bytes) -> tuple[str, int, int]:
    """Format and size of a PNG or JPEG, read from its header; anything else is refused."""
    if data.startswith(b"\x89PNG\r\n\x1a\n") and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        return ".png", width, height
    if data.startswith(b"\xff\xd8"):
        position = 2
        while position + 9 < len(data):
            if data[position] != 0xFF:
                break
            marker = data[position + 1]
            length = struct.unpack(">H", data[position + 2 : position + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                height, width = struct.unpack(">HH", data[position + 5 : position + 9])
                return ".jpg", width, height
            position += 2 + length
    raise InvalidInput("unsupported_image")


def check_image(data: bytes) -> str:
    if len(data) > MAX_IMAGE_BYTES:
        raise InvalidInput("image_too_large")
    extension, width, height = image_dimensions(data)
    if not (0 < width <= MAX_IMAGE_SIDE and 0 < height <= MAX_IMAGE_SIDE):
        raise InvalidInput("unsupported_image")
    return extension


def graphic_path(repository: Path, package: str, locale: str, kind: str) -> Path | None:
    if kind not in GRAPHICS:
        raise InvalidInput("invalid_graphic")
    images = locale_dir(repository, package, locale) / "images"
    return next(
        (
            images / f"{kind}{extension}"
            for extension in IMAGE_EXTENSIONS
            if (images / f"{kind}{extension}").is_file()
        ),
        None,
    )


def write_graphic(repository: Path, package: str, locale: str, kind: str, data: bytes) -> None:
    extension = check_image(data)
    old = graphic_path(repository, package, locale, kind)
    images = locale_dir(repository, package, locale) / "images"
    images.mkdir(parents=True, exist_ok=True)
    if old is not None:
        old.unlink()
    write_atomic(images / f"{kind}{extension}", data)


def add_apk_icon(repository: Path, package: str, data: bytes) -> Path | None:
    """Gives an app without icon the one of its APK, which fdroidserver cannot always extract itself."""
    available = locales(repository, package)
    if any(graphic_path(repository, package, locale, "icon") for locale in available):
        return None
    locale = DEFAULT_LOCALE if DEFAULT_LOCALE in available or not available else available[0]
    write_graphic(repository, package, locale, "icon", data)
    return graphic_path(repository, package, locale, "icon")


def screenshots(repository: Path, package: str, locale: str, kind: str) -> list[str]:
    if kind not in SCREENSHOT_TYPES:
        raise InvalidInput("invalid_screenshot_type")
    directory = locale_dir(repository, package, locale) / "images" / kind
    if not directory.is_dir():
        return []
    return sorted(path.name for path in directory.iterdir() if path.suffix.lower() in IMAGE_EXTENSIONS)


def add_screenshot(repository: Path, package: str, locale: str, kind: str, data: bytes) -> str:
    """Adds a screenshot after the existing ones; every file is then renumbered in order."""
    extension = check_image(data)
    existing = screenshots(repository, package, locale, kind)
    directory = locale_dir(repository, package, locale) / "images" / kind
    directory.mkdir(parents=True, exist_ok=True)
    added = f"zz-new-{len(existing)}{extension}"
    write_atomic(directory / added, data)
    return order_screenshots(repository, package, locale, kind, [*existing, added])[-1]


def order_screenshots(repository: Path, package: str, locale: str, kind: str, names: list[str]) -> list[str]:
    """fdroidserver publishes screenshots sorted by file name, so the order is written in the names."""
    existing = screenshots(repository, package, locale, kind)
    if sorted(names) != existing:
        raise InvalidInput("screenshots_changed")
    directory = locale_dir(repository, package, locale) / "images" / kind
    temporary = [
        (directory / name, directory / f".ordering-{index}{Path(name).suffix}")
        for index, name in enumerate(names)
    ]
    for source, target in temporary:
        source.rename(target)
    ordered = []
    for index, (_, target) in enumerate(temporary, start=1):
        final = directory / f"{index:02d}{target.suffix.lower()}"
        target.rename(final)
        ordered.append(final.name)
    return ordered


def screenshot_path(repository: Path, package: str, locale: str, kind: str, name: str) -> Path:
    if name not in screenshots(repository, package, locale, kind):
        raise InvalidInput("screenshot_not_found")
    return locale_dir(repository, package, locale) / "images" / kind / name


def category_locales(repository: Path) -> set[str]:
    """Languages with a translation of the categories (config/<locale>/categories.yml)."""
    config = repository / "config"
    if not config.is_dir():
        return set()
    return {
        directory.name
        for directory in config.iterdir()
        if directory.is_dir() and (directory / "categories.yml").is_file()
    }


def read_categories(repository: Path) -> dict[str, dict[str, str]]:
    """Defined categories with their name per language (config/categories.yml and config/<locale>/)."""
    defined: dict[str, dict[str, str]] = {}
    for key, value in yamlfile.load(repository / "config" / "categories.yml").items():
        defined[str(key)] = {DEFAULT_LOCALE: str((value or {}).get("name") or key)}
    for locale in sorted(category_locales(repository)):
        for key, value in yamlfile.load(repository / "config" / locale / "categories.yml").items():
            if value and value.get("name"):
                defined.setdefault(str(key), {})[locale] = str(value["name"])
    return defined


def category_files(locales: set[str]) -> list[str]:
    return [
        "config/categories.yml",
        *(f"config/{check_locale(locale)}/categories.yml" for locale in sorted(locales)),
    ]


def define_official_categories(repository: Path, ids: list[str]) -> None:
    """Defines the F-Droid categories among ids with their translated names, keeping the other definitions."""
    defined = read_categories(repository)
    for locale in {DEFAULT_LOCALE} | OFFICIAL_CATEGORY_LOCALES:
        entries = {
            key: {"name": OFFICIAL_CATEGORIES[key][locale]}
            for key in ids
            if key in OFFICIAL_CATEGORIES and key not in defined
        }
        if entries:
            path = repository / "config" / "categories.yml"
            if locale != DEFAULT_LOCALE:
                path = repository / "config" / locale / "categories.yml"
            path.parent.mkdir(parents=True, exist_ok=True)
            yamlfile.update(path, entries)


def write_categories(repository: Path, categories: dict[str, dict[str, str]]) -> None:
    yamlfile.write(
        repository / "config" / "categories.yml",
        {key: {"name": names.get(DEFAULT_LOCALE) or key} for key, names in categories.items()},
    )
    # Every translation file is written again: one left as it was would bring back a removed category.
    locales = {locale for names in categories.values() for locale in names if locale != DEFAULT_LOCALE}
    for locale in locales | category_locales(repository):
        path = repository / "config" / check_locale(locale) / "categories.yml"
        translated = {key: {"name": names[locale]} for key, names in categories.items() if names.get(locale)}
        if translated:
            yamlfile.write(path, translated)
        else:
            path.unlink(missing_ok=True)
