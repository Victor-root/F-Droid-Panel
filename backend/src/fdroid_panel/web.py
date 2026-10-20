"""Serving the single page application, with a Content Security Policy built per response."""

from __future__ import annotations

import secrets
from importlib import resources
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

ADMIN_PREFIX = "/admin"
NONCE_PLACEHOLDER = "<script>"


def static_root() -> Path:
    return Path(str(resources.files("fdroid_panel"))) / "static"


def content_security_policy(nonce: str) -> str:
    return "; ".join(
        [
            "default-src 'self'",
            f"script-src 'self' 'nonce-{nonce}'",
            f"style-src 'self' 'nonce-{nonce}'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
    )


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        return response


def _index(request: Request) -> Response:
    index = static_root() / "index.html"
    if not index.is_file():
        return HTMLResponse("The interface is not built. Run `npm run build` in frontend/.", status_code=503)
    nonce = secrets.token_urlsafe(18)
    html = index.read_text(encoding="utf-8")
    # The theme bootstrap is the only inline script; the meta tag hands the nonce to libraries
    # that insert <style> elements at runtime.
    html = html.replace(NONCE_PLACEHOLDER, f'<script nonce="{nonce}">', 1)
    html = html.replace("</head>", f'<meta name="csp-nonce" content="{nonce}" />\n</head>', 1)
    return HTMLResponse(
        html,
        headers={"Content-Security-Policy": content_security_policy(nonce), "Cache-Control": "no-store"},
    )


def mount_interface(app: FastAPI) -> None:
    @app.get(ADMIN_PREFIX, include_in_schema=False)
    def admin_root() -> RedirectResponse:
        return RedirectResponse(f"{ADMIN_PREFIX}/")

    @app.get(ADMIN_PREFIX + "/{path:path}", include_in_schema=False)
    def interface(path: str, request: Request) -> Response:
        if path.startswith("api/"):
            return Response(status_code=404)
        candidate = static_root().joinpath(*[part for part in path.split("/") if part not in ("", ".", "..")])
        if path and candidate.is_file():
            cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        return _index(request)
