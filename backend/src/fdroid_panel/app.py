from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import __version__
from .api import appearance, apps, audit_routes, auth_routes, jobs, me, repositories, system, users
from .backups import Backups
from .config import Settings
from .db import Database, create_database_engine, migrate
from .errors import ApiError, api_error_handler, error_response
from .fdroid import probe
from .jobs import JobRunner
from .public import AccessCache, mount_repositories
from .secrets_store import SecretStore
from .web import ADMIN_PREFIX, SecurityHeaders, mount_interface

API_PREFIX = f"{ADMIN_PREFIX}/api"

logger = logging.getLogger(__name__)


def _prepare_directories(settings: Settings) -> None:
    for directory in (
        settings.data_dir,
        settings.jobs_dir,
        settings.staging_dir,
        settings.backups_dir,
        settings.repos_dir,
        settings.data_dir / "home",
        settings.data_dir / "tmp",
    ):
        directory.mkdir(parents=True, exist_ok=True, mode=0o750)


async def _check_fdroid(settings: Settings, runner: JobRunner, database: Database) -> None:
    """Runs the self-test once per fdroidserver version, so a broken installation shows up early."""
    info = await probe(settings.fdroid_command, settings.data_dir / "home")
    with database.session() as db:
        last = system.latest_self_test(db)
    tested_version = (last.result or {}).get("version") if last else None
    if info.version is not None and tested_version != info.version:
        system.start_self_test(settings, runner, user_id=None)


def create_app(settings: Settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        _prepare_directories(settings)
        engine = create_database_engine(settings.database_path)
        migrate(engine)
        database = Database(engine)
        runner = JobRunner(database, settings.jobs_dir)
        runner.attach(asyncio.get_running_loop())
        runner.recover()
        app.state.settings = settings
        app.state.database = database
        app.state.jobs = runner
        app.state.backups = Backups(settings.backups_dir)
        app.state.secrets = SecretStore(settings.secrets_dir)
        app.state.access_cache = AccessCache()
        app.state.apk_cache_locks = defaultdict(asyncio.Lock)
        await _check_fdroid(settings, runner, database)
        yield
        await runner.wait_idle()
        engine.dispose()

    app = FastAPI(
        title="F-Droid Panel",
        version=__version__,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json",
    )
    app.add_middleware(SecurityHeaders)
    app.add_exception_handler(ApiError, api_error_handler)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, error: RequestValidationError) -> JSONResponse:
        fields = [
            {
                "field": ".".join(str(part) for part in item["loc"][1:]),
                # Validators raise ValueError("some_code"); built-in checks have a type such as "missing".
                "code": str(item["ctx"]["error"]) if item["type"] == "value_error" else item["type"],
            }
            for item in error.errors()
        ]
        return error_response(422, "invalid_request", {"fields": fields})

    api = APIRouter(prefix=API_PREFIX)

    @api.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    for module in (auth_routes, me, users, appearance, jobs, audit_routes, system, repositories, apps):
        api.include_router(module.router)
    app.include_router(api)

    mount_interface(app)
    mount_repositories(app)
    return app
