from fastapi import APIRouter, FastAPI

from fdroid_panel import __version__

API_PREFIX = "/admin/api"


def create_app() -> FastAPI:
    app = FastAPI(
        title="F-Droid Panel",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json",
    )
    app.include_router(_health_router(), prefix=API_PREFIX)
    return app


def _health_router() -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    return router
