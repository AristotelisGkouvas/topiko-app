import logging
import mimetypes
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.openapi.utils import get_openapi
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from app.api.v1.archive import router as archive_router
from app.api.v1.auth import router as auth_router
from app.api.v1.club_admin import router as club_admin_router
from app.api.v1.editor import router as editor_router
from app.api.v1.events import router as events_router
from app.api.v1.predictions import router as predictions_router
from app.api.v1.mvp import router as mvp_router
from app.api.v1.push import router as push_router
from app.api.v1.volunteer import router as volunteer_router
from app.api.v1.public import router as public_router
from app.core.config import settings
from app.core.db import engine
from app.core.logging import configure as configure_logging
from app.core.middleware import LiveCache, OriginCheck, RequestContext, SecurityHeaders

configure_logging(
    json_lines=settings.environment == "production",
    level=logging.DEBUG if settings.debug else logging.INFO,
)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=(
        "Αποτελέσματα, βαθμολογίες και γήπεδα ερασιτεχνικού ποδοσφαίρου, "
        "ανά Ένωση Ποδοσφαιρικών Σωματείων."
    ),
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

# Added innermost first: each add_middleware wraps everything added before it.
# OriginCheck sits inside CORS so its 403 still carries CORS headers and the
# browser shows the reason instead of a bare network error.
app.add_middleware(
    OriginCheck,
    allowed=settings.cors_origins,
    cookies=(settings.session_cookie, f"{settings.session_cookie}_ethelontis"),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Retry-After"],
)
app.add_middleware(
    LiveCache,
    paths=("/matches/live", "/feed", "/standings/live"),
    cookies=(settings.session_cookie, f"{settings.session_cookie}_ethelontis"),
)
# JSON compresses about tenfold, and the readers this is for are on metered
# 3G in the mountains. Small responses are left alone: under half a kilobyte
# the gzip header costs more than it saves.
app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
app.add_middleware(SecurityHeaders, hsts=settings.cookie_secure)
app.add_middleware(RequestContext)

app.include_router(auth_router)
app.include_router(editor_router)
app.include_router(club_admin_router)
app.include_router(events_router)
app.include_router(predictions_router)
app.include_router(push_router)
app.include_router(mvp_router)
app.include_router(volunteer_router)
app.include_router(public_router)


class _Media(StaticFiles):
    """Uploaded images. Every file has a name that is never reused (see
    app.services.media), so each can be cached for a year without a way for
    it to go stale."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


# The type comes from the platform's MIME table, and not every one knows WebP
# (Windows' registry often does not). Served as text/plain with nosniff, the
# browser refuses to draw it.
mimetypes.add_type("image/webp", ".webp")
Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
app.mount(settings.media_url, _Media(directory=settings.media_dir), name="media")

# After the public router: its /{association_slug}/{...} routes are more
# specific, and a catch-all here would shadow them.
app.include_router(archive_router)


def _openapi() -> dict:
    """The generated document, with one correction.

    Pydantic lists a field with a default as optional, which is true of a
    request and false of a response: every response here is serialised whole,
    so each of its fields is always present (null, at worst). The frontend's
    types are generated from this document, and "maybe missing" on every
    defaulted field would have it guarding against undefined that never comes.
    So schemas that are only ever returned get all their fields marked required.
    """
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title, version=app.version, description=app.description, routes=app.routes
    )
    schemas = schema.get("components", {}).get("schemas", {})

    def refs(node: object, into: set[str]) -> None:
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str):
                name = ref.rsplit("/", 1)[-1]
                if name not in into:
                    into.add(name)
                    refs(schemas.get(name), into)
            for value in node.values():
                refs(value, into)
        elif isinstance(node, list):
            for value in node:
                refs(value, into)

    inputs: set[str] = set()
    for path in schema.get("paths", {}).values():
        for operation in path.values():
            if isinstance(operation, dict):
                refs(operation.get("requestBody"), inputs)

    for name, body in schemas.items():
        if name not in inputs and "properties" in body:
            body["required"] = sorted(body["properties"])

    app.openapi_schema = schema
    return schema


app.openapi = _openapi  # type: ignore[method-assign]


@app.get("/health", tags=["ops"])
async def health() -> JSONResponse:
    """Up means able to answer, which means the database too. A process that
    is running but cannot reach Postgres fails every real request, and a
    health check that still says "ok" hides exactly that."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        return JSONResponse(
            {"status": "degraded", "database": "unreachable"}, status_code=503
        )
    return JSONResponse({"status": "ok", "environment": settings.environment})
