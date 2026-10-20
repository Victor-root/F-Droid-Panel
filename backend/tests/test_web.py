from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from fdroid_panel import web


@pytest.fixture
def interface(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<html><head><script>boot()</script></head><body></body></html>")
    (root / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setattr(web, "static_root", lambda: root)
    return root


def test_spa_routes_get_index_with_a_fresh_nonce(client: TestClient, interface: Path) -> None:
    first = client.get("/admin/repos/3/apps")
    second = client.get("/admin/settings")
    assert first.status_code == 200
    nonce = re.search(r'<script nonce="([^"]+)">', first.text)
    assert nonce is not None
    assert f"'nonce-{nonce.group(1)}'" in first.headers["content-security-policy"]
    assert f'<meta name="csp-nonce" content="{nonce.group(1)}"' in first.text
    assert first.headers["content-security-policy"] != second.headers["content-security-policy"]
    assert first.headers["x-frame-options"] == "DENY"


def test_assets_are_cached_and_paths_cannot_escape(client: TestClient, interface: Path) -> None:
    asset = client.get("/admin/assets/app.js")
    assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
    escape = client.get("/admin/..%2f..%2fetc/passwd")
    assert escape.status_code == 200 and "<html>" in escape.text


def test_unknown_api_paths_are_not_the_interface(client: TestClient, interface: Path) -> None:
    assert client.get("/admin/api/nothing").status_code == 404


def test_root_redirects_to_the_interface(client: TestClient) -> None:
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307 and response.headers["location"] == "/admin/"
