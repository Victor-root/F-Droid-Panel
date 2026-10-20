from fastapi.testclient import TestClient

from fdroid_panel import __version__
from fdroid_panel.app import create_app


def test_health_reports_version() -> None:
    response = TestClient(create_app()).get("/admin/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}
