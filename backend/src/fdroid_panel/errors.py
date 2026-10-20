"""API errors carry a stable code and parameters; the interface turns them into translated text."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, **params: Any) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.params = params


def not_found(code: str = "not_found", **params: Any) -> ApiError:
    return ApiError(404, code, **params)


def forbidden(code: str = "forbidden", **params: Any) -> ApiError:
    return ApiError(403, code, **params)


def conflict(code: str, **params: Any) -> ApiError:
    return ApiError(409, code, **params)


def invalid(code: str, **params: Any) -> ApiError:
    return ApiError(422, code, **params)


def error_response(status: int, code: str, params: dict[str, Any]) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "params": params}})


async def api_error_handler(_request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, ApiError):
        raise error
    return error_response(error.status, error.code, error.params)
