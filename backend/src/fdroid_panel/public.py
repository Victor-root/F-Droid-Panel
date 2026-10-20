"""What F-Droid clients and visitors see: repository files and a small public page."""

from __future__ import annotations

import base64
import binascii
import hashlib
import html
import secrets
import time
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from string import Template

import segno
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from .db import Database
from .files import resolve_inside
from .models import AccessAccount, Repository, utcnow
from .repositories import read_config
from .security import verify_password
from .settings_store import get_setting

SECTIONS = ("repo", "archive")
# Index files change on every publication; clients must always revalidate them.
INDEX_SUFFIXES = (".jar", ".json", ".xml", ".html")
ACCESS_CACHE_SECONDS = 300
LAST_USED_INTERVAL = 300
PUBLIC_PAGE_KEY = "public_page"


class AccessCache:
    """Remembers recently verified repository credentials: clients send them with every file request."""

    def __init__(self) -> None:
        self._entries: dict[tuple[int, str, str], float] = {}

    @staticmethod
    def _key(repository_id: int, username: str, password: str) -> tuple[int, str, str]:
        return repository_id, username, hashlib.sha256(password.encode()).hexdigest()

    def valid(self, repository_id: int, username: str, password: str) -> bool:
        expiry = self._entries.get(self._key(repository_id, username, password))
        return expiry is not None and expiry > time.monotonic()

    def remember(self, repository_id: int, username: str, password: str) -> None:
        self._entries[self._key(repository_id, username, password)] = time.monotonic() + ACCESS_CACHE_SECONDS

    def forget(self, repository_id: int) -> None:
        self._entries = {key: value for key, value in self._entries.items() if key[0] != repository_id}


@dataclass(frozen=True)
class Match:
    repository: Repository
    section: str | None
    rest: str


def _match(repositories: list[Repository], path: str) -> Match | None:
    for repository in sorted(repositories, key=lambda item: len(item.url_prefix), reverse=True):
        prefix = repository.url_prefix
        if prefix and path != prefix and not path.startswith(prefix + "/"):
            continue
        remainder = path[len(prefix) :].strip("/") if prefix else path.strip("/")
        if remainder == "":
            if prefix:
                return Match(repository, None, "")
            continue
        section, _, rest = remainder.partition("/")
        if section in SECTIONS:
            return Match(repository, section, rest)
    return None


def _credentials(request: Request) -> tuple[str, str] | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "basic":
        return None
    try:
        username, _, password = base64.b64decode(value).decode().partition(":")
    except (binascii.Error, UnicodeDecodeError):
        return None
    return username, password


def _authorized(request: Request, db: DbSession, repository: Repository) -> bool:
    if not repository.private:
        return True
    credentials = _credentials(request)
    if credentials is None:
        return False
    username, password = credentials
    cache: AccessCache = request.app.state.access_cache
    if cache.valid(repository.id, username, password):
        return True
    account = db.scalar(
        select(AccessAccount).where(
            AccessAccount.repository_id == repository.id,
            AccessAccount.username == username,
            AccessAccount.disabled.is_(False),
        )
    )
    if account is None or not verify_password(account.password_hash, password):
        return False
    cache.remember(repository.id, username, password)
    now = utcnow()
    if account.last_used_at is None or (now - account.last_used_at).total_seconds() > LAST_USED_INTERVAL:
        account.last_used_at = now
        db.commit()
    return True


def _challenge(repository: Repository) -> Response:
    return Response(
        status_code=401,
        headers={"WWW-Authenticate": f'Basic realm="{repository.name}", charset="UTF-8"'},
    )


def _serve_file(repository: Repository, section: str, rest: str) -> Response:
    if not rest or any(part.startswith(".") for part in rest.split("/")):
        return Response(status_code=404)
    try:
        target = resolve_inside(Path(repository.path) / section, rest)
    except ValueError:
        return Response(status_code=404)
    if not target.is_file():
        return Response(status_code=404)
    cache = (
        "no-cache" if target.suffix in INDEX_SUFFIXES or "/diff/" in f"/{rest}" else "public, max-age=86400"
    )
    return FileResponse(target, headers={"Cache-Control": cache})


# Texts of the public page, in the languages of the interface.
TEXTS = {
    "en": {
        "add": "Add this repository to F-Droid",
        "scan": "Scan this code with the F-Droid app, or open the link on your phone.",
        "address": "Repository address",
        "fingerprint": "Fingerprint",
        "private": (
            "This repository is private: the F-Droid app will ask for the user name and password "
            "you were given."
        ),
        "apps": "{count} apps",
        "powered": "Hosted with F-Droid Panel, an independent project not affiliated with F-Droid.",
        "none": "No public repository here.",
    },
    "fr": {
        "add": "Ajouter ce dépôt à F-Droid",
        "scan": "Scannez ce code avec l’appli F-Droid, ou ouvrez le lien sur votre téléphone.",
        "address": "Adresse du dépôt",
        "fingerprint": "Empreinte",
        "private": (
            "Ce dépôt est privé : l’appli F-Droid demandera le nom d’utilisateur et le mot de passe "
            "qui vous ont été donnés."
        ),
        "apps": "{count} applis",
        "powered": "Hébergé avec F-Droid Panel, un projet indépendant non affilié à F-Droid.",
        "none": "Aucun dépôt public ici.",
    },
}


def _template(name: str) -> Template:
    return Template((resources.files("fdroid_panel") / "data" / name).read_text(encoding="utf-8"))


PAGE = _template("public-page.html")
CARD = _template("public-card.html")


def _language(request: Request) -> str:
    for part in request.headers.get("accept-language", "").split(","):
        code = part.split(";")[0].strip().lower()[:2]
        if code in TEXTS:
            return code
    return "en"


def _base_url(request: Request) -> str:
    return (request.app.state.settings.public_url or str(request.base_url)).rstrip("/")


def _card(request: Request, repository: Repository, texts: dict[str, str]) -> str:
    path = Path(repository.path)
    config = read_config(path)
    prefix = f"/{repository.url_prefix}" if repository.url_prefix else ""
    repo_url = f"{_base_url(request)}{prefix}/repo"
    add_url = f"{repo_url}?fingerprint={repository.fingerprint}" if repository.fingerprint else repo_url
    fingerprint = (
        f"<dt>{texts['fingerprint']}</dt><dd><code>{html.escape(repository.fingerprint)}</code></dd>"
        if repository.fingerprint
        else ""
    )
    return CARD.substitute(
        icon=html.escape(f"{prefix}/repo/icons/{config.get('repo_icon', 'icon.png')}"),
        name=html.escape(repository.name),
        apps=texts["apps"].format(count=len(list((path / "metadata").glob("*.yml")))),
        description=html.escape(str(config.get("repo_description") or "")),
        private=f'<p class="note">{html.escape(texts["private"])}</p>' if repository.private else "",
        qr=segno.make(add_url, error="m").svg_inline(scale=5, border=2, dark="#111111", light="#ffffff"),
        add_title=texts["add"],
        scan=texts["scan"],
        add_url=html.escape(add_url),
        repo_url=html.escape(repo_url),
        address_label=texts["address"],
        fingerprint=fingerprint,
    )


def _page(
    request: Request, db: DbSession, cards: list[str], texts: dict[str, str], language: str
) -> HTMLResponse:
    nonce = secrets.token_urlsafe(18)
    page = PAGE.substitute(
        language=language,
        title="F-Droid",
        nonce=nonce,
        accent=html.escape(get_setting(db, "appearance").get("accent", "#3ddc84")),
        body="".join(cards) or f'<section class="card"><p class="muted">{texts["none"]}</p></section>',
        footer=html.escape(texts["powered"]),
    )
    policy = f"default-src 'none'; style-src 'nonce-{nonce}'; img-src 'self' data:; frame-ancestors 'none'"
    return HTMLResponse(page, headers={"Content-Security-Policy": policy, "Cache-Control": "no-cache"})


def mount_repositories(app: FastAPI) -> None:
    """Registered last: every path the panel does not use is looked up in the repositories."""

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def public(path: str, request: Request) -> Response:
        database: Database = request.app.state.database
        with database.session() as db:
            repositories = list(db.scalars(select(Repository).where(Repository.served_by_panel.is_(True))))
            language = _language(request)
            texts = TEXTS[language]
            page_enabled = get_setting(db, PUBLIC_PAGE_KEY).get("enabled", True)
            if path.strip("/") == "":
                if not page_enabled:
                    return Response(status_code=404)
                visible = [repository for repository in repositories if not repository.private]
                return _page(
                    request,
                    db,
                    [_card(request, repository, texts) for repository in visible],
                    texts,
                    language,
                )
            match = _match(repositories, path)
            if match is None:
                return Response(status_code=404)
            if not _authorized(request, db, match.repository):
                return _challenge(match.repository)
            if match.section is None:
                if not page_enabled:
                    return Response(status_code=404)
                return _page(request, db, [_card(request, match.repository, texts)], texts, language)
            return _serve_file(match.repository, match.section, match.rest)
