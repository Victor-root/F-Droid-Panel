from __future__ import annotations

import pyotp

from fdroid_panel.cli import create_setup_code
from fdroid_panel.db import Database

from .conftest import ADMIN_PASSWORD, Api


def test_health(api: Api) -> None:
    response = api.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_setup_creates_the_first_admin_once(api: Api, database: Database) -> None:
    assert api.get("/auth/status").json() == {
        "setupRequired": True,
        "authenticated": False,
        "secondFactorRequired": False,
    }
    bad = api.post(
        "/auth/setup",
        {"code": "AAAA-BBBB-CCCC", "username": "admin", "displayName": "A", "password": ADMIN_PASSWORD},
    )
    assert bad.json()["error"]["code"] == "invalid_setup_code"

    code = create_setup_code(database)
    body = {
        "code": code.lower().replace("-", " "),
        "username": "Admin",
        "displayName": "Admin",
        "password": ADMIN_PASSWORD,
    }
    assert api.post("/auth/setup", body).status_code == 200
    status = api.get("/auth/status").json()
    assert status["authenticated"] is True and status["setupRequired"] is False
    api.refresh_csrf()
    me = api.get("/me").json()
    assert me["username"] == "admin" and me["role"] == "admin"

    reused = api.post("/auth/setup", {**body, "username": "other"})
    assert reused.json()["error"]["code"] == "invalid_setup_code"


def test_setup_rejects_a_short_password(api: Api, database: Database) -> None:
    code = create_setup_code(database)
    response = api.post(
        "/auth/setup", {"code": code, "username": "admin", "displayName": "A", "password": "short"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"


def test_login_logout(admin: Api) -> None:
    assert admin.post("/auth/logout").status_code == 204
    assert admin.get("/me").status_code == 401
    wrong = admin.post("/auth/login", {"username": "admin", "password": "wrong password"})
    assert wrong.status_code == 401 and wrong.json()["error"]["code"] == "invalid_credentials"
    admin.login("admin", ADMIN_PASSWORD)
    assert admin.get("/me").json()["username"] == "admin"


def test_login_is_throttled(admin: Api) -> None:
    admin.post("/auth/logout")
    for _ in range(5):
        assert (
            admin.post("/auth/login", {"username": "admin", "password": "nope nope nope"}).status_code == 401
        )
    blocked = admin.post("/auth/login", {"username": "admin", "password": ADMIN_PASSWORD})
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "too_many_attempts"


def test_unknown_user_gets_the_same_answer(api: Api) -> None:
    response = api.post("/auth/login", {"username": "ghost", "password": "whatever whatever"})
    assert response.status_code == 401 and response.json()["error"]["code"] == "invalid_credentials"


def test_writes_need_the_client_header_and_the_csrf_token(admin: Api) -> None:
    no_header = admin.client.post("/admin/api/auth/login", json={"username": "a", "password": "b"})
    assert no_header.status_code == 403 and no_header.json()["error"]["code"] == "csrf"

    token = admin.csrf
    admin.csrf = "forged"
    assert admin.patch("/me", {"displayName": "X"}).status_code == 403
    admin.csrf = token
    assert admin.patch("/me", {"displayName": "X"}).json()["displayName"] == "X"


def test_second_factor_and_recovery_codes(admin: Api) -> None:
    secret = admin.post("/me/second-factor/setup").json()["secret"]
    assert admin.post("/me/second-factor/enable", {"code": "000000"}).status_code == 422
    codes = admin.post("/me/second-factor/enable", {"code": pyotp.TOTP(secret).now()}).json()["codes"]
    assert len(codes) == 10

    admin.post("/auth/logout")
    response = admin.post("/auth/login", {"username": "admin", "password": ADMIN_PASSWORD})
    assert response.json() == {"secondFactorRequired": True}
    assert admin.get("/me").status_code == 401
    assert admin.post("/auth/second-factor", {"code": "123456"}).status_code == 401
    assert admin.post("/auth/second-factor", {"code": codes[0]}).status_code == 200
    admin.refresh_csrf()

    admin.post("/auth/logout")
    admin.post("/auth/login", {"username": "admin", "password": ADMIN_PASSWORD})
    assert admin.post("/auth/second-factor", {"code": codes[0]}).status_code == 401
    assert admin.post("/auth/second-factor", {"code": pyotp.TOTP(secret).now()}).status_code == 200


def test_password_change_keeps_the_current_session(admin: Api) -> None:
    new_password = "another long password"
    assert (
        admin.post("/me/password", {"currentPassword": "wrong", "newPassword": new_password}).status_code
        == 401
    )
    assert (
        admin.post(
            "/me/password", {"currentPassword": ADMIN_PASSWORD, "newPassword": new_password}
        ).status_code
        == 204
    )
    assert admin.get("/me").status_code == 200
    admin.post("/auth/logout")
    admin.login("admin", new_password)


def test_validation_errors_carry_field_codes(api: Api, database: Database) -> None:
    code = create_setup_code(database)
    response = api.post(
        "/auth/setup", {"code": code, "username": "No Spaces", "displayName": "A", "password": "short"}
    )
    assert response.json()["error"]["params"]["fields"] == [
        {"field": "username", "code": "invalid_username"},
        {"field": "password", "code": "password_too_short"},
    ]
