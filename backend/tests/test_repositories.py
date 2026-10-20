from __future__ import annotations

import base64
import shutil
from collections.abc import Callable
from pathlib import Path

import pytest

from fdroid_panel import yamlfile
from fdroid_panel.models import Repository
from fdroid_panel.public import AccessCache, _match
from fdroid_panel.repositories import default_icon, url_prefix

from .conftest import Api, needs_fdroid, wait_for_job
from .test_apps import png


def test_url_prefix() -> None:
    assert url_prefix("https://fdroid.example.org/repo") == ""
    assert url_prefix("https://example.org/fdroid/repo/") == "fdroid"
    assert url_prefix("https://example.org/a/b/repo") == "a/b"
    with pytest.raises(ValueError):
        url_prefix("https://example.org/fdroid")


def test_paths_are_matched_to_the_longest_prefix() -> None:
    root = Repository(id=1, url_prefix="", name="root", path="/r")
    family = Repository(id=2, url_prefix="family", name="family", path="/f")
    repositories = [root, family]
    first = _match(repositories, "repo/index-v1.jar")
    assert first is not None and first.repository is root and first.rest == "index-v1.jar"
    second = _match(repositories, "family/archive/app.apk")
    assert second is not None and second.repository is family and second.section == "archive"
    landing = _match(repositories, "family")
    assert landing is not None and landing.section is None
    assert _match(repositories, "admin/something") is None


def test_access_cache() -> None:
    cache = AccessCache()
    cache.remember(1, "phone", "secret")
    assert cache.valid(1, "phone", "secret") and not cache.valid(1, "phone", "other")
    cache.forget(1)
    assert not cache.valid(1, "phone", "secret")


def basic(username: str, password: str) -> dict[str, str]:
    return {"Authorization": "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()}


def import_fixture(api: Api, path: Path, slug: str) -> dict[str, object]:
    response = api.post("/repositories/import", {"path": str(path), "slug": slug, "movePasswords": True})
    assert response.status_code == 201, response.text
    result: dict[str, object] = response.json()
    return result


@needs_fdroid
def test_import_publish_and_serve(fdroid_admin: Api, repository_copy: Callable[[str], Path]) -> None:
    path = repository_copy("small")
    # An icon that only exists in repo/icons/, as people often have it, must survive the publication.
    published_icon = path / "repo" / "icons" / "icon.png"
    (path / "icon.png").rename(published_icon)
    icon = published_icon.read_bytes()
    inspection = fdroid_admin.get("/repositories/inspect", params={"path": str(path)}).json()
    assert inspection["problems"] == [] and inspection["passwordsInConfig"] is True
    assert inspection["urlPrefix"] == "small" and inspection["fingerprint"]

    repository = import_fixture(fdroid_admin, path, "small")
    config = yamlfile.load(path / "config.yml")
    assert config["keystorepass"] == {"env": "FDROID_PANEL_KEYSTOREPASS"}
    assert repository["apps"] == 2 and repository["repoUrl"] == "https://fdroid.example.org/small/repo"

    job_id = fdroid_admin.post(f"/repositories/{repository['id']}/publish").json()["jobId"]
    job = wait_for_job(fdroid_admin, job_id)
    assert job["status"] == "succeeded", fdroid_admin.get(f"/jobs/{job_id}/log").json()
    assert job["result"]["versions"] == 3 and job["result"]["leftOut"] == []
    assert job["result"]["fingerprint"] == inspection["fingerprint"]
    assert published_icon.read_bytes() == icon

    client = fdroid_admin.client
    index = client.get("/small/repo/index-v1.jar")
    assert index.status_code == 200 and index.headers["cache-control"] == "no-cache"
    assert client.get("/small/repo/org.example.alpha_2.apk").headers["cache-control"].startswith("public")
    assert client.get("/small/repo/../config.yml").status_code == 404
    assert client.get("/small/repo/%2e%2e/keystore.p12").status_code == 404
    assert fdroid_admin.get(f"/repositories/{repository['id']}/icon").headers["content-type"] == "image/png"
    page = client.get("/small")
    assert page.status_code == 200 and "fingerprint=" + inspection["fingerprint"] in page.text


@needs_fdroid
def test_private_repository_needs_an_access_account(
    fdroid_admin: Api, repository_copy: Callable[[str], Path]
) -> None:
    repository = import_fixture(fdroid_admin, repository_copy("small"), "small")
    fdroid_admin.patch(f"/repositories/{repository['id']}", {"private": True})
    client = fdroid_admin.client
    denied = client.get("/small/repo/index-v1.jar")
    assert denied.status_code == 401 and denied.headers["www-authenticate"].startswith("Basic")

    account = fdroid_admin.post(
        f"/repositories/{repository['id']}/access", {"label": "Phone", "username": "phone"}
    ).json()
    assert client.get("/small/repo/index-v1.jar", headers=basic("phone", "wrong")).status_code == 401
    assert (
        client.get("/small/repo/index-v1.jar", headers=basic("phone", account["password"])).status_code == 200
    )
    assert "small" not in client.get("/").text

    chosen = fdroid_admin.post(
        f"/repositories/{repository['id']}/access",
        {"label": "Tablet", "username": "tablet", "password": "my own password"},
    ).json()
    assert chosen["password"] == "my own password"
    assert (
        client.get("/small/repo/index-v1.jar", headers=basic("tablet", "my own password")).status_code == 200
    )
    base = f"/repositories/{repository['id']}/access/{chosen['id']}/password"
    assert fdroid_admin.get(base).json()["password"] == "my own password"
    changed = fdroid_admin.put(base, {}).json()["password"]
    old = basic("tablet", "my own password")
    assert client.get("/small/repo/index-v1.jar", headers=old).status_code == 401
    assert client.get("/small/repo/index-v1.jar", headers=basic("tablet", changed)).status_code == 200
    assert fdroid_admin.get(base).json()["password"] == changed
    short = fdroid_admin.post(
        f"/repositories/{repository['id']}/access",
        {"label": "Watch", "username": "watch", "password": "short"},
    )
    assert short.status_code == 422

    fdroid_admin.delete(f"/repositories/{repository['id']}/access/{account['id']}")
    assert (
        client.get("/small/repo/index-v1.jar", headers=basic("phone", account["password"])).status_code == 401
    )


@needs_fdroid
def test_settings_are_pending_until_published(
    fdroid_admin: Api, repository_copy: Callable[[str], Path]
) -> None:
    path = repository_copy("small")
    repository = import_fixture(fdroid_admin, path, "small")
    detail = fdroid_admin.put(
        f"/repositories/{repository['id']}/settings",
        {"name": "Family apps", "description": "Apps: for the family", "archiveOlder": 2},
    ).json()
    assert detail["pendingChanges"] == 1 and detail["name"] == "Family apps"
    assert yamlfile.load(path / "config.yml")["repo_description"] == "Apps: for the family"

    job = wait_for_job(
        fdroid_admin, fdroid_admin.post(f"/repositories/{repository['id']}/publish").json()["jobId"]
    )
    assert job["status"] == "succeeded"
    assert fdroid_admin.get(f"/repositories/{repository['id']}").json()["pendingChanges"] == 0


@needs_fdroid
def test_a_changed_signing_key_is_refused(
    fdroid_admin: Api, repository_copy: Callable[[str], Path], fixture_repositories: Path
) -> None:
    path = repository_copy("small")
    repository = import_fixture(fdroid_admin, path, "small")
    before = (path / "repo" / "entry.jar").read_bytes()
    other = repository_copy("signer-conflict")
    shutil.copy(other / "keystore.p12", path / "keystore.p12")
    other_config = yamlfile.load(other / "config.yml")
    fdroid_admin.state.secrets.write(
        repository["id"],
        {
            "FDROID_PANEL_KEYSTOREPASS": other_config["keystorepass"],
            "FDROID_PANEL_KEYPASS": other_config["keypass"],
        },
    )
    yamlfile.update(path / "config.yml", {"repo_keyalias": other_config["repo_keyalias"]})

    job = wait_for_job(
        fdroid_admin, fdroid_admin.post(f"/repositories/{repository['id']}/publish").json()["jobId"]
    )
    assert job["status"] == "failed" and job["error"]["code"] == "signing_key_changed"
    assert (path / "repo" / "entry.jar").read_bytes() == before


@needs_fdroid
def test_apks_left_out_are_reported(fdroid_admin: Api, repository_copy: Callable[[str], Path]) -> None:
    repository = import_fixture(fdroid_admin, repository_copy("signer-conflict"), "conflict")
    job = wait_for_job(
        fdroid_admin, fdroid_admin.post(f"/repositories/{repository['id']}/publish").json()["jobId"]
    )
    assert job["result"]["leftOut"] == [{"file": "org.example.pinned_2.apk", "reason": "signer_not_allowed"}]


@needs_fdroid
def test_rollback_restores_the_previous_index(
    fdroid_admin: Api, repository_copy: Callable[[str], Path]
) -> None:
    path = repository_copy("small")
    repository = import_fixture(fdroid_admin, path, "small")
    before = (path / "repo" / "index-v2.json").read_bytes()
    wait_for_job(fdroid_admin, fdroid_admin.post(f"/repositories/{repository['id']}/publish").json()["jobId"])
    assert (path / "repo" / "index-v2.json").read_bytes() != before
    job = wait_for_job(
        fdroid_admin, fdroid_admin.post(f"/repositories/{repository['id']}/rollback").json()["jobId"]
    )
    assert job["status"] == "succeeded"
    assert (path / "repo" / "index-v2.json").read_bytes() == before


@needs_fdroid
def test_create_and_unregister(fdroid_admin: Api, tmp_path: Path) -> None:
    created = fdroid_admin.post(
        "/repositories",
        {"name": "Family", "description": "Our apps", "slug": "family", "urlPrefix": "", "archiveOlder": 3},
    )
    assert created.status_code == 201, created.text
    body = created.json()
    job = wait_for_job(fdroid_admin, body["jobId"])
    assert job["status"] == "succeeded", fdroid_admin.get(f"/jobs/{body['jobId']}/log").json()

    path = tmp_path / "data" / "repos" / "family"
    config = yamlfile.load(path / "config.yml")
    assert config["repo_url"] == "https://fdroid.example.org/repo"
    assert config["keypass"] == {"env": "FDROID_PANEL_KEYPASS"}
    assert (path / "repo" / "icons" / "icon.png").read_bytes() == default_icon()
    secrets_file = tmp_path / "secrets" / f"repository-{body['repository']['id']}.json"
    assert secrets_file.stat().st_mode & 0o777 == 0o600
    log = "\n".join(fdroid_admin.get(f"/jobs/{body['jobId']}/log").json())
    assert fdroid_admin.state.secrets.read(body["repository"]["id"])["FDROID_PANEL_KEYPASS"] not in log

    detail = fdroid_admin.get(f"/repositories/{body['repository']['id']}").json()
    assert detail["fingerprint"] and detail["publishedAt"]
    assert fdroid_admin.client.get("/repo/index-v1.jar").status_code == 200

    assert fdroid_admin.delete(f"/repositories/{body['repository']['id']}").status_code == 204
    assert isinstance(yamlfile.load(path / "config.yml")["keypass"], str)
    assert not secrets_file.exists()


@needs_fdroid
def test_repository_icon(fdroid_admin: Api, repository_copy: Callable[[str], Path]) -> None:
    path = repository_copy("small")
    repository = import_fixture(fdroid_admin, path, "small")
    headers = {"X-Requested-With": "fdroid-panel", "X-CSRF-Token": fdroid_admin.csrf}
    url = f"/admin/api/repositories/{repository['id']}/icon"
    refused = fdroid_admin.client.put(url, content=b"GIF89a....", headers=headers)
    assert refused.json()["error"]["code"] == "unsupported_image"

    icon = png(64, 64)
    detail = fdroid_admin.client.put(url, content=icon, headers=headers).json()
    assert detail["pendingChanges"] == 1
    assert fdroid_admin.client.get(url).content == icon
    job = wait_for_job(
        fdroid_admin, fdroid_admin.post(f"/repositories/{repository['id']}/publish").json()["jobId"]
    )
    assert job["status"] == "succeeded"
    assert (path / "repo" / "icons" / "icon.png").read_bytes() == icon
