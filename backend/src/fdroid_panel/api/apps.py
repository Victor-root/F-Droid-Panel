from __future__ import annotations

import asyncio
import base64
import shutil
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Header, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import Field
from pydantic.alias_generators import to_camel
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .. import apps as content
from .. import audit, downloads
from ..apk import ApkInfo, inspect_apks
from ..auth import Actor, CurrentAuth, Db, KeyActor, UploaderAuth, repository_for
from ..backups import Backups
from ..errors import ApiError, conflict, forbidden, invalid, not_found
from ..models import ApkCacheEntry, Repository, Upload, UploadStatus, utcnow
from .images import read_image_body
from .repositories import record_change, start_publish
from .schemas import ApiModel

router = APIRouter(prefix="/repositories/{repository_id}", tags=["apps"])

MAX_UPLOAD = 2 * 1024**3
MAX_CHUNK = 64 * 1024 * 1024
# Raised when data/inspect_apk.py reads more or better: cached readings of older versions are redone.
APK_READER_VERSION = 3


class VersionOut(ApiModel):
    version_code: int
    version_name: str | None
    file: str
    section: str
    size: int
    added: datetime | None
    min_sdk: int | None
    target_sdk: int | None
    signer: str | None
    permissions: list[str]
    published: bool
    # None when the files are served by another web server, which the panel cannot count.
    downloads: int | None


class AppSummaryOut(ApiModel):
    package_name: str
    name: str
    summary: str | None
    latest_version_name: str | None
    latest_version_code: int | None
    versions: int
    unpublished: int
    has_metadata: bool
    categories: list[str]
    icon_url: str | None
    downloads: int | None


class LocaleOut(ApiModel):
    locale: str
    name: str
    summary: str
    description: str
    graphics: dict[str, str | None]
    screenshots: dict[str, list[str]]


class AppDetailOut(AppSummaryOut):
    downloads_last_30_days: int | None
    metadata: dict[str, Any]
    legacy_texts: dict[str, str]
    locales: list[LocaleOut]
    version_list: list[VersionOut]
    allowed_signers: list[str]


class MetadataIn(ApiModel):
    values: dict[str, Any]


class TextsIn(ApiModel):
    name: str = Field(default="", max_length=content.NAME_MAX)
    summary: str = Field(default="", max_length=content.SUMMARY_MAX)
    description: str = Field(default="", max_length=content.DESCRIPTION_MAX)


class OrderIn(ApiModel):
    order: list[str]


class UploadIn(ApiModel):
    filename: str = Field(min_length=1, max_length=256)
    size: int = Field(gt=0, le=MAX_UPLOAD)


class UploadOut(ApiModel):
    id: int
    filename: str
    size: int
    received: int
    status: UploadStatus
    info: dict[str, Any] | None
    checks: dict[str, Any] | None


class AddIn(ApiModel):
    name: str = Field(default="", max_length=content.NAME_MAX)
    summary: str = Field(default="", max_length=content.SUMMARY_MAX)
    categories: list[str] = Field(default_factory=list)


class AddedOut(ApiModel):
    package_name: str
    new_app: bool
    # The publication an upload key with that right started, None otherwise.
    publish_job_id: int | None = None


class CategoryIn(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    names: dict[str, str]


class CategoriesIn(ApiModel):
    categories: list[CategoryIn]


class CategoryOut(ApiModel):
    id: str
    names: dict[str, str]
    apps: int


class OfficialCategoryOut(ApiModel):
    id: str
    names: dict[str, str]


def _backups(request: Request) -> Backups:
    backups: Backups = request.app.state.backups
    return backups


def _home(request: Request) -> Path:
    home: Path = request.app.state.settings.data_dir / "home"
    return home


def _staging(request: Request, upload_id: int) -> Path:
    staging: Path = request.app.state.settings.staging_dir
    return staging / f"upload-{upload_id}.apk"


def _language(request: Request) -> str:
    return request.headers.get("accept-language", "en").split(",")[0].strip() or "en"


def _input(error: content.InvalidInput) -> ApiError:
    return invalid(str(error))


def _download_counts(db: DbSession, repository: Repository, days: int | None = None) -> dict[str, int] | None:
    """Downloads per APK file, over the last days when given; None when another web server serves them."""
    if not repository.served_by_panel:
        return None
    since = utcnow().date() - timedelta(days=days - 1) if days else None
    return downloads.totals(db, repository.id, since)


def _app_downloads(app: content.App, counts: dict[str, int] | None) -> int | None:
    return None if counts is None else sum(counts.get(version.file, 0) for version in app.versions)


def _version_out(version: content.Version, counts: dict[str, int] | None) -> VersionOut:
    return VersionOut(
        **{key: value for key, value in asdict(version).items() if key != "sha256"},
        downloads=None if counts is None else counts.get(version.file, 0),
    )


async def load_apps(request: Request, db: DbSession, repository: Repository) -> dict[str, content.App]:
    """Every app of the repository: published versions from the index, other APK files inspected once."""
    path = Path(repository.path)
    published = content.read_index(path)
    indexed = {(version.section, version.file) for _, versions in published.values() for version in versions}

    # Concurrent requests would inspect the same new files and store them twice.
    locks: dict[int, asyncio.Lock] = request.app.state.apk_cache_locks
    async with locks[repository.id]:
        cached = {
            entry.path: entry
            for entry in db.scalars(select(ApkCacheEntry).where(ApkCacheEntry.repository_id == repository.id))
        }
        unindexed: dict[str, dict[str, Any]] = {}
        to_inspect: list[Path] = []
        for relative in content.apk_files(path):
            section, file = relative.split("/", 1)
            if (section, file) in indexed:
                continue
            stat = (path / relative).stat()
            entry = cached.pop(relative, None)
            if (
                entry is not None
                and entry.size == stat.st_size
                and entry.modified == stat.st_mtime
                and entry.info.get("reader") == APK_READER_VERSION
            ):
                unindexed[relative] = entry.info
            else:
                if entry is not None:
                    db.delete(entry)
                to_inspect.append(path / relative)
        for entry in cached.values():
            db.delete(entry)
        if to_inspect:
            results = await inspect_apks(repository.fdroid_command, _home(request), to_inspect)
            for apk_path, result in results.items():
                relative = str(apk_path.relative_to(path))
                inspected: dict[str, Any] = {"error": result} if isinstance(result, str) else asdict(result)
                inspected["reader"] = APK_READER_VERSION
                stat = apk_path.stat()
                db.add(
                    ApkCacheEntry(
                        repository_id=repository.id,
                        path=relative,
                        size=stat.st_size,
                        modified=stat.st_mtime,
                        info=inspected,
                    )
                )
                unindexed[relative] = inspected
        db.commit()

    apps: dict[str, content.App] = {}
    for package, (metadata, versions) in published.items():
        apps[package] = content.App(package=package, index=metadata, versions=list(versions))
    for package in content.metadata_packages(path):
        apps.setdefault(package, content.App(package=package))
    for relative, info in unindexed.items():
        if "error" in info:
            continue
        app = apps.setdefault(info["package"], content.App(package=info["package"]))
        section, file = relative.split("/", 1)
        app.label = app.label or info.get("label")
        app.versions.append(
            content.Version(
                version_code=info["version_code"],
                version_name=info.get("version_name"),
                file=file,
                section=section,
                size=info["size"],
                sha256=info["sha256"],
                added=None,
                min_sdk=info.get("min_sdk"),
                target_sdk=info.get("target_sdk"),
                signer=info.get("signer"),
                permissions=info.get("permissions", []),
                published=False,
            )
        )
    for app in apps.values():
        app.metadata = content.read_metadata(path, app.package)
        app.versions.sort(key=lambda version: version.version_code, reverse=True)
    return apps


def _summary(
    request: Request, repository: Repository, app: content.App, counts: dict[str, int] | None
) -> AppSummaryOut:
    path = Path(repository.path)
    texts = content.display_texts(path, app, _language(request))
    latest = app.latest
    categories = app.metadata.get("Categories") or []
    return AppSummaryOut(
        package_name=app.package,
        name=texts["name"] or app.package,
        summary=texts["summary"],
        latest_version_name=latest.version_name if latest else None,
        latest_version_code=latest.version_code if latest else None,
        versions=len(app.versions),
        unpublished=sum(1 for version in app.versions if not version.published),
        has_metadata=(path / "metadata" / f"{app.package}.yml").is_file(),
        categories=[str(category) for category in categories]
        if isinstance(categories, list)
        else [str(categories)],
        icon_url=f"/admin/api/repositories/{repository.id}/apps/{app.package}/icon"
        if app.versions or content.locales(path, app.package)
        else None,
        downloads=_app_downloads(app, counts),
    )


async def _app(request: Request, db: DbSession, repository: Repository, package: str) -> content.App:
    try:
        content.check_package(package)
    except content.InvalidInput as error:
        raise _input(error) from None
    app = (await load_apps(request, db, repository)).get(package)
    if app is None:
        raise not_found("app_not_found")
    return app


def _allowed_signers(app: content.App) -> list[str]:
    pinned = app.metadata.get("AllowedAPKSigningKeys")
    if pinned:
        return [str(pinned)] if isinstance(pinned, str) else [str(item) for item in pinned]
    return sorted({version.signer for version in app.versions if version.signer})


@router.get("/apps")
async def list_apps(repository_id: int, request: Request, db: Db, auth: CurrentAuth) -> list[AppSummaryOut]:
    repository = repository_for(db, auth, repository_id)
    apps = await load_apps(request, db, repository)
    counts = _download_counts(db, repository)
    summaries = [_summary(request, repository, app, counts) for app in apps.values()]
    return sorted(summaries, key=lambda summary: summary.name.lower())


@router.get("/apps/{package}")
async def get_app(
    repository_id: int, package: str, request: Request, db: Db, auth: CurrentAuth
) -> AppDetailOut:
    repository = repository_for(db, auth, repository_id)
    app = await _app(request, db, repository, package)
    counts = _download_counts(db, repository)
    path = Path(repository.path)
    base = f"/admin/api/repositories/{repository.id}/apps/{package}/files"
    locales = []
    for locale in content.locales(path, package):
        texts = content.read_texts(path, package, locale)
        graphics = {
            kind: (f"{base}/{locale}/{kind}" if content.graphic_path(path, package, locale, kind) else None)
            for kind in content.GRAPHICS
        }
        shots = {
            kind: [
                f"{base}/{locale}/{kind}/{name}" for name in content.screenshots(path, package, locale, kind)
            ]
            for kind in content.SCREENSHOT_TYPES
        }
        locales.append(
            LocaleOut(
                locale=locale,
                name=texts.get("name", ""),
                summary=texts.get("summary", ""),
                description=texts.get("description", ""),
                graphics=graphics,
                screenshots=shots,
            )
        )
    editable = {
        key: app.metadata.get(key)
        for key in (*content.TEXT_FIELDS, *content.LIST_FIELDS)
        if app.metadata.get(key) is not None
    }
    anti_features = editable.get("AntiFeatures")
    if isinstance(anti_features, dict):
        editable["AntiFeatures"] = list(anti_features)
    return AppDetailOut(
        **_summary(request, repository, app, counts).model_dump(),
        downloads_last_30_days=_app_downloads(app, _download_counts(db, repository, days=30)),
        metadata=editable,
        legacy_texts=content.legacy_texts(app.metadata),
        locales=locales,
        version_list=[_version_out(version, counts) for version in app.versions],
        allowed_signers=_allowed_signers(app),
    )


@router.get("/apps/{package}/icon")
async def get_app_icon(
    repository_id: int, package: str, request: Request, db: Db, auth: CurrentAuth
) -> Response:
    repository = repository_for(db, auth, repository_id)
    app = await _app(request, db, repository, package)
    path = Path(repository.path)
    for locale in [content.DEFAULT_LOCALE, *content.locales(path, package)]:
        if locale in content.locales(path, package):
            graphic = content.graphic_path(path, package, locale, "icon")
            if graphic is not None:
                return FileResponse(graphic, headers={"Cache-Control": "no-cache"})
    for version in app.versions:
        if version.published:
            for density in ("640", "480", "320", "240", "160", "120"):
                icon = path / version.section / f"icons-{density}" / f"{package}.{version.version_code}.png"
                if icon.is_file():
                    return FileResponse(icon, headers={"Cache-Control": "no-cache"})
    cached = db.scalars(select(ApkCacheEntry).where(ApkCacheEntry.repository_id == repository.id)).all()
    for entry in sorted(cached, key=lambda item: item.info.get("version_code", 0), reverse=True):
        if entry.info.get("package") == package and entry.info.get("icon"):
            return Response(
                base64.b64decode(entry.info["icon"]),
                media_type="image/png",
                headers={"Cache-Control": "no-cache"},
            )
    return Response(status_code=404)


@router.get("/apps/{package}/files/{locale}/{kind}")
def get_graphic(
    repository_id: int, package: str, locale: str, kind: str, db: Db, auth: CurrentAuth
) -> Response:
    repository = repository_for(db, auth, repository_id)
    try:
        graphic = content.graphic_path(Path(repository.path), package, locale, kind)
    except content.InvalidInput as error:
        raise _input(error) from None
    if graphic is None:
        raise not_found()
    return FileResponse(graphic, headers={"Cache-Control": "no-cache"})


@router.get("/apps/{package}/files/{locale}/{kind}/{name}")
def get_screenshot(
    repository_id: int, package: str, locale: str, kind: str, name: str, db: Db, auth: CurrentAuth
) -> Response:
    repository = repository_for(db, auth, repository_id)
    try:
        screenshot = content.screenshot_path(Path(repository.path), package, locale, kind, name)
    except content.InvalidInput as error:
        raise _input(error) from None
    return FileResponse(screenshot, headers={"Cache-Control": "no-cache"})


def _writable(db: DbSession, auth: Actor, repository_id: int) -> Repository:
    return repository_for(db, auth, repository_id, write=True)


def _changed(
    request: Request,
    db: DbSession,
    auth: Actor,
    repository: Repository,
    kind: str,
    target: str,
    files: list[str],
) -> None:
    details: dict[str, Any] = {"files": files}
    if isinstance(auth, KeyActor):
        details["key"] = auth.key.name
    audit.record(
        db,
        f"app.{kind}",
        user=auth.user,
        ip=auth.ip,
        repository_id=repository.id,
        target=target,
        details=details,
    )
    record_change(request, db, repository, auth.user, kind, target)


@router.put("/apps/{package}/metadata")
async def update_metadata(
    repository_id: int, package: str, body: MetadataIn, request: Request, db: Db, auth: CurrentAuth
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    files = [f"metadata/{package}.yml", *content.category_files(content.OFFICIAL_CATEGORY_LOCALES)]
    _backups(request).snapshot(repository.id, path, files, "app-metadata")
    try:
        content.update_metadata(path, package, body.values)
        content.define_official_categories(path, list(body.values.get("Categories") or []))
    except content.InvalidInput as error:
        raise _input(error) from None
    _changed(request, db, auth, repository, "app_metadata", package, files)
    return await get_app(repository_id, package, request, db, auth)


def _text_files(package: str, locale: str) -> list[str]:
    return [
        f"metadata/{package}.yml",
        *(
            f"metadata/{package}/{lang}/{name}"
            for lang in {locale, content.DEFAULT_LOCALE}
            for name in content.TEXT_FILES.values()
        ),
    ]


@router.put("/apps/{package}/texts/{locale}")
async def update_texts(
    repository_id: int, package: str, locale: str, body: TextsIn, request: Request, db: Db, auth: CurrentAuth
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    try:
        files = _text_files(package, content.check_locale(locale))
        _backups(request).snapshot(repository.id, path, files, "app-texts")
        content.write_texts(path, package, locale, body.model_dump())
    except content.InvalidInput as error:
        raise _input(error) from None
    _changed(request, db, auth, repository, "app_texts", f"{package} ({locale})", files)
    return await get_app(repository_id, package, request, db, auth)


def _locale_files(path: Path, package: str, locale: str) -> list[str]:
    directory = content.locale_dir(path, package, locale)
    return (
        [str(file.relative_to(path)) for file in directory.rglob("*") if file.is_file()]
        if directory.is_dir()
        else []
    )


@router.delete("/apps/{package}/locales/{locale}")
async def delete_locale(
    repository_id: int, package: str, locale: str, request: Request, db: Db, auth: CurrentAuth
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    try:
        files = _locale_files(path, package, locale)
    except content.InvalidInput as error:
        raise _input(error) from None
    _backups(request).snapshot(repository.id, path, files, "app-locale", move=True)
    shutil.rmtree(content.locale_dir(path, package, locale), ignore_errors=True)
    _changed(request, db, auth, repository, "app_texts", f"{package} ({locale})", files)
    return await get_app(repository_id, package, request, db, auth)


@router.put("/apps/{package}/graphics/{locale}/{kind}")
async def put_graphic(
    repository_id: int, package: str, locale: str, kind: str, request: Request, db: Db, auth: CurrentAuth
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    data = await read_image_body(request)
    try:
        old = content.graphic_path(path, package, locale, kind)
        files = [str(old.relative_to(path))] if old else []
        _backups(request).snapshot(repository.id, path, files, "app-graphics")
        content.write_graphic(path, package, locale, kind, data)
    except content.InvalidInput as error:
        raise _input(error) from None
    _changed(request, db, auth, repository, "app_graphics", f"{package} ({locale})", files)
    return await get_app(repository_id, package, request, db, auth)


@router.delete("/apps/{package}/graphics/{locale}/{kind}")
async def delete_graphic(
    repository_id: int, package: str, locale: str, kind: str, request: Request, db: Db, auth: CurrentAuth
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    try:
        graphic = content.graphic_path(path, package, locale, kind)
    except content.InvalidInput as error:
        raise _input(error) from None
    if graphic is None:
        raise not_found()
    files = [str(graphic.relative_to(path))]
    _backups(request).snapshot(repository.id, path, files, "app-graphics", move=True)
    _changed(request, db, auth, repository, "app_graphics", f"{package} ({locale})", files)
    return await get_app(repository_id, package, request, db, auth)


@router.post("/apps/{package}/screenshots/{locale}/{kind}")
async def add_screenshot(
    repository_id: int, package: str, locale: str, kind: str, request: Request, db: Db, auth: CurrentAuth
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    data = await read_image_body(request)
    try:
        files = [
            str(content.screenshot_path(path, package, locale, kind, name).relative_to(path))
            for name in content.screenshots(path, package, locale, kind)
        ]
        _backups(request).snapshot(repository.id, path, files, "app-screenshots")
        content.add_screenshot(path, package, locale, kind, data)
    except content.InvalidInput as error:
        raise _input(error) from None
    _changed(request, db, auth, repository, "app_screenshots", f"{package} ({locale})", files)
    return await get_app(repository_id, package, request, db, auth)


@router.put("/apps/{package}/screenshots/{locale}/{kind}")
async def order_screenshots(
    repository_id: int,
    package: str,
    locale: str,
    kind: str,
    body: OrderIn,
    request: Request,
    db: Db,
    auth: CurrentAuth,
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    try:
        files = [
            str(content.screenshot_path(path, package, locale, kind, name).relative_to(path))
            for name in content.screenshots(path, package, locale, kind)
        ]
        _backups(request).snapshot(repository.id, path, files, "app-screenshots")
        content.order_screenshots(path, package, locale, kind, [Path(name).name for name in body.order])
    except content.InvalidInput as error:
        raise _input(error) from None
    _changed(request, db, auth, repository, "app_screenshots", f"{package} ({locale})", files)
    return await get_app(repository_id, package, request, db, auth)


@router.delete("/apps/{package}/screenshots/{locale}/{kind}/{name}")
async def delete_screenshot(
    repository_id: int,
    package: str,
    locale: str,
    kind: str,
    name: str,
    request: Request,
    db: Db,
    auth: CurrentAuth,
) -> AppDetailOut:
    repository = _writable(db, auth, repository_id)
    await _app(request, db, repository, package)
    path = Path(repository.path)
    try:
        screenshot = content.screenshot_path(path, package, locale, kind, name)
    except content.InvalidInput as error:
        raise _input(error) from None
    files = [str(screenshot.relative_to(path))]
    _backups(request).snapshot(repository.id, path, files, "app-screenshots", move=True)
    remaining = content.screenshots(path, package, locale, kind)
    if remaining:
        content.order_screenshots(path, package, locale, kind, remaining)
    _changed(request, db, auth, repository, "app_screenshots", f"{package} ({locale})", files)
    return await get_app(repository_id, package, request, db, auth)


@router.delete("/apps/{package}/versions/{version_code}", status_code=204)
async def delete_version(
    repository_id: int, package: str, version_code: int, request: Request, db: Db, auth: CurrentAuth
) -> None:
    repository = _writable(db, auth, repository_id)
    app = await _app(request, db, repository, package)
    versions = [version for version in app.versions if version.version_code == version_code]
    if not versions:
        raise not_found("version_not_found")
    files = sorted({f"{version.section}/{version.file}" for version in versions})
    path = Path(repository.path)
    _backups(request).snapshot(
        repository.id, path, [file for file in files if (path / file).is_file()], "delete-version", move=True
    )
    _changed(
        request,
        db,
        auth,
        repository,
        "version_deleted",
        f"{package} {versions[0].version_name or version_code}",
        files,
    )


@router.delete("/apps/{package}", status_code=204)
async def delete_app(repository_id: int, package: str, request: Request, db: Db, auth: CurrentAuth) -> None:
    repository = _writable(db, auth, repository_id)
    app = await _app(request, db, repository, package)
    path = Path(repository.path)
    files = [f"{version.section}/{version.file}" for version in app.versions]
    files.append(f"metadata/{package}.yml")
    metadata_dir = path / "metadata" / package
    if metadata_dir.is_dir():
        files += [str(file.relative_to(path)) for file in metadata_dir.rglob("*") if file.is_file()]
    _backups(request).snapshot(
        repository.id, path, [file for file in files if (path / file).is_file()], "delete-app", move=True
    )
    shutil.rmtree(metadata_dir, ignore_errors=True)
    _changed(request, db, auth, repository, "app_deleted", package, files)


def _upload(db: DbSession, auth: Actor, repository: Repository, upload_id: int) -> Upload:
    upload = db.get(Upload, upload_id)
    if upload is None or upload.repository_id != repository.id:
        raise not_found("upload_not_found")
    if upload.user_id != auth.user.id and not auth.is_admin:
        raise forbidden()
    return upload


def _upload_out(upload: Upload) -> UploadOut:
    out = UploadOut.model_validate(upload)
    if out.info is not None:
        out.info = {to_camel(key): value for key, value in out.info.items()}
    return out


def check_upload(apps: dict[str, content.App], info: ApkInfo) -> dict[str, Any]:
    """What blocks adding this APK, and what deserves attention, each as an error code with parameters."""
    blocking: list[dict[str, Any]] = [{"code": problem, "params": {}} for problem in info.problems]
    warnings: list[dict[str, Any]] = []
    app = apps.get(info.package)
    if app is not None:
        allowed = _allowed_signers(app)
        if info.signer and allowed and info.signer not in allowed:
            blocking.append(
                {"code": "signer_mismatch", "params": {"expected": allowed[0], "found": info.signer}}
            )
        same = next((version for version in app.versions if version.version_code == info.version_code), None)
        if same is not None:
            blocking.append(
                {"code": "version_exists", "params": {"version": same.version_name or str(same.version_code)}}
            )
        latest = app.latest
        if latest is not None and same is None and info.version_code < latest.version_code:
            warnings.append(
                {
                    "code": "older_version",
                    "params": {"latest": latest.version_name or str(latest.version_code)},
                }
            )
        if latest is not None:
            added = sorted(set(info.permissions) - set(latest.permissions))
            if added:
                warnings.append({"code": "new_permissions", "params": {"permissions": added}})
    return {"newApp": app is None, "blocking": blocking, "warnings": warnings}


@router.post("/uploads", status_code=201)
def start_upload(
    repository_id: int, body: UploadIn, request: Request, db: Db, auth: UploaderAuth
) -> UploadOut:
    repository = _writable(db, auth, repository_id)
    name = Path(body.filename).name
    if name.lower().endswith((".aab", ".apks", ".xapk")):
        raise invalid("bundle_not_supported")
    if not name.lower().endswith(".apk"):
        raise invalid("not_an_apk")
    upload = Upload(
        repository_id=repository.id,
        user_id=auth.user.id,
        filename=name,
        size=body.size,
        status=UploadStatus.RECEIVING,
    )
    db.add(upload)
    db.commit()
    staging = _staging(request, upload.id)
    staging.parent.mkdir(parents=True, exist_ok=True)
    staging.write_bytes(b"")
    return _upload_out(upload)


@router.put("/uploads/{upload_id}")
async def receive_chunk(
    repository_id: int,
    upload_id: int,
    request: Request,
    db: Db,
    auth: UploaderAuth,
    offset: Annotated[int, Query(ge=0)],
    content_length: Annotated[int, Header(gt=0, le=MAX_CHUNK)],
) -> UploadOut:
    """Receives the file in chunks, so reverse proxies with a small body limit do not get in the way."""
    repository = _writable(db, auth, repository_id)
    upload = _upload(db, auth, repository, upload_id)
    if upload.status != UploadStatus.RECEIVING:
        raise conflict("upload_complete")
    if offset != upload.received:
        raise conflict("upload_offset", received=upload.received)
    if offset + content_length > upload.size:
        raise invalid("upload_too_large")
    staging = _staging(request, upload.id)
    written = 0
    with staging.open("ab") as handle:
        async for chunk in request.stream():
            written += len(chunk)
            if written > content_length:
                raise invalid("upload_too_large")
            handle.write(chunk)
    upload.received += written
    if upload.received == upload.size:
        await _inspect_upload(request, db, repository, upload)
    db.commit()
    return _upload_out(upload)


async def _inspect_upload(request: Request, db: DbSession, repository: Repository, upload: Upload) -> None:
    staging = _staging(request, upload.id)
    result = (await inspect_apks(repository.fdroid_command, _home(request), [staging]))[staging]
    if isinstance(result, str):
        upload.status = UploadStatus.REJECTED
        upload.checks = {"newApp": False, "blocking": [{"code": result, "params": {}}], "warnings": []}
        return
    apps = await load_apps(request, db, repository)
    checks = check_upload(apps, result)
    upload.info = {key: value for key, value in asdict(result).items() if key != "icon"} | {
        "hasIcon": result.icon is not None
    }
    upload.checks = checks
    upload.status = UploadStatus.REJECTED if checks["blocking"] else UploadStatus.READY
    if result.icon is not None:
        staging.with_suffix(".png").write_bytes(base64.b64decode(result.icon))


@router.get("/uploads/{upload_id}")
async def get_upload(
    repository_id: int, upload_id: int, request: Request, db: Db, auth: UploaderAuth
) -> UploadOut:
    """The upload with its checks run again: other files may have been added since it was inspected."""
    repository = repository_for(db, auth, repository_id)
    upload = _upload(db, auth, repository, upload_id)
    if upload.info is not None and upload.status in (UploadStatus.READY, UploadStatus.REJECTED):
        info = ApkInfo(**{key: value for key, value in upload.info.items() if key != "hasIcon"}, icon=None)
        upload.checks = check_upload(await load_apps(request, db, repository), info)
        upload.status = UploadStatus.REJECTED if upload.checks["blocking"] else UploadStatus.READY
        db.commit()
    return _upload_out(upload)


@router.get("/uploads/{upload_id}/icon")
def get_upload_icon(
    repository_id: int, upload_id: int, request: Request, db: Db, auth: CurrentAuth
) -> Response:
    repository = repository_for(db, auth, repository_id)
    upload = _upload(db, auth, repository, upload_id)
    icon = _staging(request, upload.id).with_suffix(".png")
    if not icon.is_file():
        raise not_found()
    return FileResponse(icon, media_type="image/png")


@router.post("/uploads/{upload_id}/add")
async def add_upload(
    repository_id: int, upload_id: int, body: AddIn, request: Request, db: Db, auth: UploaderAuth
) -> AddedOut:
    repository = _writable(db, auth, repository_id)
    upload = _upload(db, auth, repository, upload_id)
    if upload.status != UploadStatus.READY or upload.info is None:
        raise conflict("upload_not_ready")
    staging = _staging(request, upload.id)
    # The checks are run again: the repository may have changed since the file was inspected.
    await _inspect_upload(request, db, repository, upload)
    if upload.status != UploadStatus.READY or upload.info is None or upload.checks is None:
        db.commit()
        raise conflict("upload_not_ready")
    info, new_app = upload.info, bool(upload.checks["newApp"])
    path = Path(repository.path)
    target = f"repo/{info['package']}_{info['version_code']}.apk"
    if (path / target).exists():
        raise conflict("version_exists", version=info.get("version_name") or str(info["version_code"]))
    # Everything this may write, so that discarding the change removes it again.
    _backups(request).snapshot(
        repository.id,
        path,
        [
            target,
            *(_text_files(info["package"], content.DEFAULT_LOCALE) if new_app else []),
            *(content.category_files(content.OFFICIAL_CATEGORY_LOCALES) if new_app else []),
            *(
                f"metadata/{info['package']}/{locale}/images/icon{extension}"
                for locale in {content.DEFAULT_LOCALE, *content.locales(path, info["package"])}
                for extension in content.IMAGE_EXTENSIONS
            ),
        ],
        "add-version",
    )
    shutil.move(staging, path / target)
    files = [target]
    if new_app:
        try:
            content.create_metadata(path, info["package"], info.get("signer"), body.categories)
            content.define_official_categories(path, body.categories)
            content.write_texts(
                path,
                info["package"],
                content.DEFAULT_LOCALE,
                {"name": body.name or info.get("label") or "", "summary": body.summary},
            )
        except content.InvalidInput as error:
            raise _input(error) from None
    icon = staging.with_suffix(".png")
    if icon.is_file():
        try:
            written = content.add_apk_icon(path, info["package"], icon.read_bytes())
        except content.InvalidInput:
            written = None  # an icon the panel cannot read does not keep the APK out
        if written is not None:
            files.append(str(written.relative_to(path)))
        icon.unlink()
    upload.status = UploadStatus.ADDED
    kind = "app_added" if new_app else "version_added"
    label = f"{info['package']} {info.get('version_name') or info['version_code']}"
    _changed(request, db, auth, repository, kind, label, files)
    publish_job_id = None
    if isinstance(auth, KeyActor) and auth.key.can_publish and not repository.auto_publish:
        publish_job_id = start_publish(request, db, repository, auth.user)
    return AddedOut(package_name=info["package"], new_app=new_app, publish_job_id=publish_job_id)


@router.delete("/uploads/{upload_id}", status_code=204)
def discard_upload(repository_id: int, upload_id: int, request: Request, db: Db, auth: UploaderAuth) -> None:
    repository = repository_for(db, auth, repository_id)
    upload = _upload(db, auth, repository, upload_id)
    staging = _staging(request, upload.id)
    staging.unlink(missing_ok=True)
    staging.with_suffix(".png").unlink(missing_ok=True)
    db.delete(upload)
    db.commit()


@router.get("/categories")
async def list_categories(
    repository_id: int, request: Request, db: Db, auth: CurrentAuth
) -> list[CategoryOut]:
    repository = repository_for(db, auth, repository_id)
    defined = content.read_categories(Path(repository.path))
    used: dict[str, int] = {}
    for app in (await load_apps(request, db, repository)).values():
        categories = app.metadata.get("Categories") or []
        for category in categories if isinstance(categories, list) else [categories]:
            used[str(category)] = used.get(str(category), 0) + 1
    names = sorted(set(defined) | set(used), key=str.lower)
    return [CategoryOut(id=name, names=defined.get(name, {}), apps=used.get(name, 0)) for name in names]


@router.get("/categories/official")
def list_official_categories(repository_id: int, db: Db, auth: CurrentAuth) -> list[OfficialCategoryOut]:
    """The categories of F-Droid, offered first so that apps use names every F-Droid client knows."""
    repository_for(db, auth, repository_id)
    return [OfficialCategoryOut(id=key, names=names) for key, names in content.OFFICIAL_CATEGORIES.items()]


@router.put("/categories")
async def set_categories(
    repository_id: int, body: CategoriesIn, request: Request, db: Db, auth: CurrentAuth
) -> list[CategoryOut]:
    repository = _writable(db, auth, repository_id)
    path = Path(repository.path)
    categories = {category.id: category.names for category in body.categories}
    try:
        files = content.category_files(
            {locale for names in categories.values() for locale in names} - {content.DEFAULT_LOCALE}
            | content.category_locales(path)
        )
        _backups(request).snapshot(repository.id, path, files, "categories")
        content.write_categories(path, categories)
    except content.InvalidInput as error:
        raise _input(error) from None
    audit.record(db, "repository.categories", user=auth.user, ip=auth.ip, repository_id=repository.id)
    record_change(request, db, repository, auth.user, "categories")
    return await list_categories(repository_id, request, db, auth)
