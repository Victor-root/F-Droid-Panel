from __future__ import annotations

from .conftest import Api


def test_appearance_is_public_and_admin_editable(admin: Api) -> None:
    assert admin.get("/appearance").json() == {"accent": "#3ddc84"}
    assert admin.put("/appearance", {"accent": "#4285F4"}).json() == {"accent": "#4285f4"}
    assert admin.put("/appearance", {"accent": "blue"}).status_code == 422
    admin.post("/auth/logout")
    assert admin.get("/appearance").json() == {"accent": "#4285f4"}
