from __future__ import annotations

from datetime import timedelta

from sqlalchemy import update

from fdroid_panel.db import Database
from fdroid_panel.models import Session, utcnow

from .conftest import ADMIN_PASSWORD, Api
from .test_apps import png


def test_admin_manages_users(admin: Api) -> None:
    created = admin.post(
        "/users",
        {"username": "maria", "displayName": "Maria", "role": "maintainer", "password": "maria password"},
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    assert [user["username"] for user in admin.get("/users").json()] == ["admin", "maria"]

    taken = admin.post(
        "/users", {"username": "maria", "displayName": "M", "role": "viewer", "password": "x" * 12}
    )
    assert taken.json()["error"]["code"] == "username_taken"

    assert admin.patch(f"/users/{user_id}", {"role": "viewer"}).json()["role"] == "viewer"
    assert admin.delete(f"/users/{user_id}").status_code == 204


def test_the_last_admin_cannot_be_removed(admin: Api) -> None:
    me = admin.get("/me").json()
    assert admin.patch(f"/users/{me['id']}", {"role": "viewer"}).json()["error"]["code"] == "last_admin"
    assert admin.delete(f"/users/{me['id']}").json()["error"]["code"] == "cannot_delete_self"


def test_non_admins_cannot_manage_users(admin: Api) -> None:
    admin.post(
        "/users", {"username": "vic", "displayName": "Vic", "role": "maintainer", "password": "vic password"}
    )
    admin.post("/auth/logout")
    admin.login("vic", "vic password")
    assert admin.get("/users").status_code == 403
    admin.post("/auth/logout")
    admin.login("admin", ADMIN_PASSWORD)


def test_disabled_users_cannot_log_in(admin: Api) -> None:
    user_id = admin.post(
        "/users", {"username": "old", "displayName": "Old", "role": "viewer", "password": "old password"}
    ).json()["id"]
    admin.patch(f"/users/{user_id}", {"disabled": True})
    admin.post("/auth/logout")
    response = admin.post("/auth/login", {"username": "old", "password": "old password"})
    assert response.status_code == 401


def test_sensitive_actions_need_a_recent_password(admin: Api, database: Database) -> None:
    with database.session() as db:
        db.execute(update(Session).values(authenticated_at=utcnow() - timedelta(hours=1)))
        db.commit()
    body = {"username": "late", "displayName": "Late", "role": "viewer", "password": "late password"}
    assert admin.post("/users", body).json()["error"]["code"] == "reauthentication_required"
    assert admin.post("/auth/confirm", {"password": "wrong"}).status_code == 401
    assert admin.post("/auth/confirm", {"password": ADMIN_PASSWORD}).status_code == 204
    assert admin.post("/users", body).status_code == 201


def test_session_policy_can_be_relaxed(admin: Api, database: Database) -> None:
    assert admin.get("/system/sessions").json() == {"idleDays": 7, "confirmMinutes": 10}
    assert admin.put("/system/sessions", {"idleDays": 2, "confirmMinutes": None}).status_code == 422
    assert admin.put("/system/sessions", {"idleDays": 1, "confirmMinutes": None}).status_code == 200
    with database.session() as db:
        db.execute(update(Session).values(authenticated_at=utcnow() - timedelta(days=300)))
        db.commit()
    body = {"username": "late", "displayName": "Late", "role": "viewer", "password": "late password"}
    assert admin.post("/users", body).status_code == 201

    with database.session() as db:
        db.execute(update(Session).values(last_seen_at=utcnow() - timedelta(days=2)))
        db.commit()
    assert admin.get("/me").status_code == 401


def test_profile_picture(admin: Api) -> None:
    headers = {"X-Requested-With": "fdroid-panel", "X-CSRF-Token": admin.csrf}
    picture = png(64, 64)
    me = admin.client.put("/admin/api/me/avatar", content=picture, headers=headers).json()
    assert me["avatarUrl"].startswith(f"/admin/api/users/{me['id']}/avatar?v=")
    assert admin.client.get(me["avatarUrl"]).content == picture
    assert admin.get("/users").json()[0]["avatarUrl"] == me["avatarUrl"]

    refused = admin.client.put("/admin/api/me/avatar", content=b"<svg/>", headers=headers).json()
    assert refused["error"]["code"] == "unsupported_image"
    too_wide = admin.client.put("/admin/api/me/avatar", content=png(2000, 10), headers=headers).json()
    assert too_wide["error"]["code"] == "unsupported_image"

    assert admin.delete("/me/avatar").json()["avatarUrl"] is None
    assert admin.client.get(me["avatarUrl"]).status_code == 404
