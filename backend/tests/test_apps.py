from __future__ import annotations

import json
import struct
import subprocess
import sys
import zlib
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from fdroid_panel import yamlfile
from fdroid_panel.apps import InvalidInput, image_dimensions

from .conftest import Api, needs_fdroid, wait_for_job

MAKE_APK = Path(__file__).resolve().parents[2] / "tools" / "fixtures" / "make_apk.py"


def png(width: int, height: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = (b"\x00" + b"\x10\x20\x30" * width) * height
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def test_image_dimensions() -> None:
    assert image_dimensions(png(3, 2)) == (".png", 3, 2)
    with pytest.raises(InvalidInput):
        image_dimensions(b"GIF89a....")


def build_apk(
    keys: Path,
    out: Path,
    package: str,
    code: int,
    key: str = "dev",
    label: str = "App",
    adaptive: bool = False,
    webp: bool = False,
) -> Path:
    subprocess.run(
        [
            sys.executable,
            str(MAKE_APK),
            "--package",
            package,
            "--version-code",
            str(code),
            "--version-name",
            f"1.{code}",
            "--label",
            label,
            "--keystore",
            str(keys / f"{key}.p12"),
            "--dname",
            f"CN=Fixture signer {key}",
            "--out",
            str(out),
            "--permission",
            "android.permission.CAMERA",
            *(["--adaptive-icon"] if adaptive else []),
            *(["--webp-icon"] if webp else []),
        ],
        check=True,
        capture_output=True,
    )
    return out


def upload(api: Api, repository_id: int, apk: Path, chunk: int = 4096) -> dict[str, Any]:
    data = apk.read_bytes()
    created = api.post(f"/repositories/{repository_id}/uploads", {"filename": apk.name, "size": len(data)})
    assert created.status_code == 201, created.text
    upload_id = created.json()["id"]
    result: dict[str, Any] = {}
    for offset in range(0, len(data), chunk):
        response = api.client.put(
            f"/admin/api/repositories/{repository_id}/uploads/{upload_id}",
            params={"offset": offset},
            content=data[offset : offset + chunk],
            headers={
                "X-Requested-With": "fdroid-panel",
                "X-CSRF-Token": api.csrf,
                "Content-Type": "application/octet-stream",
            },
        )
        assert response.status_code == 200, response.text
        result = response.json()
    return result


@pytest.fixture
def imported(fdroid_admin: Api, repository_copy: Callable[[str], Path]) -> tuple[Api, int, Path]:
    path = repository_copy("small")
    response = fdroid_admin.post("/repositories/import", {"path": str(path), "slug": "small"})
    assert response.status_code == 201, response.text
    return fdroid_admin, response.json()["id"], path


@needs_fdroid
def test_list_apps(imported: tuple[Api, int, Path]) -> None:
    api, repository_id, _ = imported
    apps = api.get(f"/repositories/{repository_id}/apps").json()
    assert [(app["packageName"], app["versions"], app["latestVersionName"]) for app in apps] == [
        ("org.example.alpha", 2, "1.2"),
        ("org.example.beta", 1, "1.10"),
    ]
    assert api.client.get(apps[0]["iconUrl"]).headers["content-type"] == "image/png"


@needs_fdroid
def test_new_version_upload_and_publish(
    imported: tuple[Api, int, Path], fixture_repositories: Path, tmp_path: Path
) -> None:
    api, repository_id, path = imported
    keys = fixture_repositories / "_signing-keys"
    result = upload(api, repository_id, build_apk(keys, tmp_path / "a3.apk", "org.example.alpha", 3))
    assert result["status"] == "ready", result
    assert result["checks"]["newApp"] is False
    assert result["checks"]["warnings"] == [
        {"code": "new_permissions", "params": {"permissions": ["android.permission.CAMERA"]}}
    ]

    added = api.post(f"/repositories/{repository_id}/uploads/{result['id']}/add", {}).json()
    assert added == {"packageName": "org.example.alpha", "newApp": False}
    assert (path / "repo" / "org.example.alpha_3.apk").is_file()
    detail = api.get(f"/repositories/{repository_id}/apps/org.example.alpha").json()
    assert [(v["versionCode"], v["published"]) for v in detail["versionList"]] == [
        (3, False),
        (2, True),
        (1, True),
    ]
    assert api.get(f"/repositories/{repository_id}").json()["changes"][0]["kind"] == "version_added"

    job = wait_for_job(api, api.post(f"/repositories/{repository_id}/publish").json()["jobId"])
    assert job["status"] == "succeeded" and job["result"]["versions"] == 4


@needs_fdroid
def test_uploads_are_checked(
    imported: tuple[Api, int, Path], fixture_repositories: Path, tmp_path: Path
) -> None:
    api, repository_id, _ = imported
    keys = fixture_repositories / "_signing-keys"
    other = upload(
        api, repository_id, build_apk(keys, tmp_path / "o.apk", "org.example.alpha", 5, key="other")
    )
    assert other["status"] == "rejected"
    assert other["checks"]["blocking"][0]["code"] == "signer_mismatch"
    same = upload(api, repository_id, build_apk(keys, tmp_path / "s.apk", "org.example.alpha", 2))
    assert same["checks"]["blocking"] == [{"code": "version_exists", "params": {"version": "1.2"}}]
    assert api.post(f"/repositories/{repository_id}/uploads/{same['id']}/add", {}).status_code == 409

    not_apk = tmp_path / "broken.apk"
    not_apk.write_bytes(b"not a zip")
    assert upload(api, repository_id, not_apk)["checks"]["blocking"] == [{"code": "not_an_apk", "params": {}}]
    bundle = api.post(f"/repositories/{repository_id}/uploads", {"filename": "app.aab", "size": 10})
    assert bundle.json()["error"]["code"] == "bundle_not_supported"


@needs_fdroid
def test_new_app(imported: tuple[Api, int, Path], fixture_repositories: Path, tmp_path: Path) -> None:
    api, repository_id, path = imported
    keys = fixture_repositories / "_signing-keys"
    result = upload(
        api,
        repository_id,
        build_apk(
            keys, tmp_path / "n.apk", "org.example.newapp", 1, label="Brand new", adaptive=True, webp=True
        ),
    )
    second = upload(api, repository_id, build_apk(keys, tmp_path / "n2.apk", "org.example.newapp", 2))
    assert result["checks"]["newApp"] is True and result["info"]["versionCode"] == 1
    assert second["checks"]["newApp"] is True
    assert (
        api.client.get(f"/admin/api/repositories/{repository_id}/uploads/{result['id']}/icon").status_code
        == 200
    )
    api.post(
        f"/repositories/{repository_id}/uploads/{result['id']}/add",
        {"summary": "Does new things", "categories": ["Tools"]},
    )
    # Checked again: once the first version is in, the second one is a new version of that app.
    assert (
        api.get(f"/repositories/{repository_id}/uploads/{second['id']}").json()["checks"]["newApp"] is False
    )

    # The icon comes from the APK, even when its launcher icon is adaptive with WebP bitmaps, which
    # fdroidserver does not extract: it becomes the icon of the app, as a PNG.
    icon = api.client.get(f"/admin/api/repositories/{repository_id}/apps/org.example.newapp/icon")
    assert icon.status_code == 200 and icon.content.startswith(b"\x89PNG")
    graphic = path / "metadata" / "org.example.newapp" / "en-US" / "images" / "icon.png"
    assert graphic.read_bytes() == icon.content
    metadata = yamlfile.load(path / "metadata" / "org.example.newapp.yml")
    assert metadata["Categories"] == ["Tools"] and len(metadata["AllowedAPKSigningKeys"]) == 64
    assert (path / "metadata" / "org.example.newapp" / "en-US" / "name.txt").read_text() == "Brand new\n"
    job = wait_for_job(api, api.post(f"/repositories/{repository_id}/publish").json()["jobId"])
    assert job["result"]["apps"] == 3 and job["result"]["leftOut"] == []
    index = json.loads((path / "repo" / "index-v2.json").read_text())
    assert "icon" in index["packages"]["org.example.newapp"]["metadata"]

    # An icon the app already has is kept.
    graphic.write_bytes(png(64, 64))
    api.post(f"/repositories/{repository_id}/uploads/{second['id']}/add", {})
    assert graphic.read_bytes() == png(64, 64)


@needs_fdroid
def test_texts_graphics_and_screenshots(fdroid_admin: Api, repository_copy: Callable[[str], Path]) -> None:
    path = repository_copy("hand-written")
    repository_id = fdroid_admin.post("/repositories/import", {"path": str(path), "slug": "hw"}).json()["id"]
    base = f"/repositories/{repository_id}/apps/org.example.handwritten"
    detail = fdroid_admin.get(base).json()
    assert detail["legacyTexts"]["name"] == "Hand written"

    detail = fdroid_admin.put(
        f"{base}/texts/fr-FR", {"name": "Écrit à la main", "summary": "Résumé", "description": "Texte."}
    ).json()
    assert detail["legacyTexts"] == {}
    assert {locale["locale"]: locale["name"] for locale in detail["locales"]} == {
        "en-US": "Hand written",
        "fr-FR": "Écrit à la main",
    }
    text = (path / "metadata" / "org.example.handwritten.yml").read_text()
    assert "\nName:" not in text and text.startswith("# Maintained by hand")

    headers = {"X-Requested-With": "fdroid-panel", "X-CSRF-Token": fdroid_admin.csrf}
    url = f"/admin/api{base}"
    assert (
        fdroid_admin.client.put(
            f"{url}/graphics/en-US/icon", content=png(512, 512), headers=headers
        ).status_code
        == 200
    )
    assert (
        fdroid_admin.client.put(f"{url}/graphics/en-US/icon", content=b"nope", headers=headers).json()[
            "error"
        ]["code"]
        == "unsupported_image"
    )
    for size in (10, 20, 30):
        fdroid_admin.client.post(
            f"{url}/screenshots/en-US/phoneScreenshots", content=png(size, size), headers=headers
        )
    shots = fdroid_admin.get(base).json()["locales"][0]["screenshots"]["phoneScreenshots"]
    assert [shot.rsplit("/", 1)[1] for shot in shots] == ["01.png", "02.png", "03.png"]
    reordered = fdroid_admin.put(
        f"{base}/screenshots/en-US/phoneScreenshots", {"order": ["03.png", "01.png", "02.png"]}
    ).json()
    first = fdroid_admin.client.get(reordered["locales"][0]["screenshots"]["phoneScreenshots"][0])
    assert image_dimensions(first.content)[1] == 30
    fdroid_admin.delete(f"{base}/screenshots/en-US/phoneScreenshots/02.png")
    assert len(fdroid_admin.get(base).json()["locales"][0]["screenshots"]["phoneScreenshots"]) == 2

    job = wait_for_job(
        fdroid_admin, fdroid_admin.post(f"/repositories/{repository_id}/publish").json()["jobId"]
    )
    assert job["status"] == "succeeded"
    metadata = json.loads((path / "repo" / "index-v2.json").read_text())["packages"][
        "org.example.handwritten"
    ]["metadata"]
    assert metadata["name"] == {"en-US": "Hand written", "fr-FR": "Écrit à la main"}
    assert len(metadata["screenshots"]["phone"]["en-US"]) == 2


@needs_fdroid
def test_delete_version_and_app(imported: tuple[Api, int, Path]) -> None:
    api, repository_id, path = imported
    assert api.delete(f"/repositories/{repository_id}/apps/org.example.alpha/versions/1").status_code == 204
    assert not (path / "repo" / "org.example.alpha_1.apk").exists()
    assert api.delete(f"/repositories/{repository_id}/apps/org.example.beta").status_code == 204
    assert not (path / "metadata" / "org.example.beta.yml").exists()
    job = wait_for_job(api, api.post(f"/repositories/{repository_id}/publish").json()["jobId"])
    assert job["result"]["apps"] == 1 and job["result"]["versions"] == 1
    backups = api.get(f"/repositories/{repository_id}/backups").json()
    assert {"delete-version", "delete-app"} <= {backup["reason"] for backup in backups}


@needs_fdroid
def test_categories(imported: tuple[Api, int, Path]) -> None:
    api, repository_id, path = imported
    categories = api.put(
        f"/repositories/{repository_id}/categories",
        {
            "categories": [
                {"id": "Tools", "names": {"en-US": "Tools", "fr": "Outils"}},
                {"id": "Games", "names": {"en-US": "Games"}},
            ]
        },
    ).json()
    assert {category["id"]: category["apps"] for category in categories} == {"Games": 0, "Tools": 2}
    assert yamlfile.load(path / "config" / "fr" / "categories.yml")["Tools"]["name"] == "Outils"

    # Choosing a category of F-Droid defines it with its translated names, next to the others.
    official = api.get(f"/repositories/{repository_id}/categories/official").json()
    assert {"id": "Navigation", "names": {"en-US": "Navigation", "fr": "Navigation"}} in official
    api.put(
        f"/repositories/{repository_id}/apps/org.example.alpha/metadata",
        {"values": {"Categories": ["Tools", "Weather"]}},
    )
    assert yamlfile.load(path / "config" / "categories.yml")["Weather"]["name"] == "Weather"
    translated = yamlfile.load(path / "config" / "fr" / "categories.yml")
    assert translated["Weather"]["name"] == "Météo" and translated["Tools"]["name"] == "Outils"
    job = wait_for_job(api, api.post(f"/repositories/{repository_id}/publish").json()["jobId"])
    assert job["status"] == "succeeded"
    index = json.loads((path / "repo" / "index-v2.json").read_text())
    assert index["repo"]["categories"]["Weather"]["name"] == {"en-US": "Weather", "fr": "Météo"}

    # A removed category does not come back from its translation.
    base = f"/repositories/{repository_id}"
    api.put(f"{base}/apps/org.example.alpha/metadata", {"values": {"Categories": ["Tools"]}})
    tools = {"id": "Tools", "names": {"en-US": "Tools"}}
    categories = api.put(f"{base}/categories", {"categories": [tools]}).json()
    assert [category["id"] for category in categories] == ["Tools"]
    assert not (path / "config" / "fr" / "categories.yml").exists()


@needs_fdroid
def test_download_counts(imported: tuple[Api, int, Path]) -> None:
    api, repository_id, path = imported
    repo = f"/{api.get(f'/repositories/{repository_id}').json()['urlPrefix']}/repo"
    files = sorted(file.name for file in (path / "repo").glob("org.example.alpha_*.apk"))
    assert api.client.get(f"{repo}/{files[0]}").status_code == 200
    # The rest of a download already counted, a check without download and a download from the start.
    api.client.get(f"{repo}/{files[0]}", headers={"Range": "bytes=100-"})
    api.client.head(f"{repo}/{files[0]}")
    api.client.get(f"{repo}/{files[1]}", headers={"Range": "bytes=0-"})
    api.client.get(f"{repo}/missing.apk")

    apps = api.get(f"/repositories/{repository_id}/apps").json()
    assert next(app for app in apps if app["packageName"] == "org.example.alpha")["downloads"] == 2
    detail = api.get(f"/repositories/{repository_id}/apps/org.example.alpha").json()
    assert detail["downloadsLast30Days"] == 2
    assert {version["file"]: version["downloads"] for version in detail["versionList"]} == {
        files[0]: 1,
        files[1]: 1,
    }
