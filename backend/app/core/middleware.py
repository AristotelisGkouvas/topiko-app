"""Cross-cutting HTTP concerns, as plain ASGI middleware.

Plain ASGI rather than Starlette's BaseHTTPMiddleware: it does not buffer the
response, and a context variable set here is visible to everything the request
runs, logging included.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from collections.abc import Iterable

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import request_id

access_log = logging.getLogger("api.access")

#: An incoming id is reused only if it looks like one — it goes into every log
#: line, so it must not be a way to write arbitrary text there.
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class RequestContext:
    """Gives every request an id, echoes it back, and logs one line per
    request with its status and duration."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get("x-request-id", "")
        rid = incoming if _SAFE_ID.match(incoming) else uuid.uuid4().hex[:16]
        token = request_id.set(rid)
        started = time.perf_counter()
        status_code = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = rid
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            # The health check runs every fifteen seconds; logging it would
            # bury everything else.
            if scope["path"] != "/health":
                access_log.info(
                    "%s %s %s",
                    scope["method"],
                    scope["path"],
                    status_code,
                    extra={
                        "method": scope["method"],
                        "path": scope["path"],
                        "status": status_code,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    },
                )
            request_id.reset(token)


class SecurityHeaders:
    """Headers that cost nothing on a JSON API and close whole classes of
    browser attack: sniffing a response into HTML, framing, leaking the URL
    to other sites. HSTS only when the deployment is HTTPS."""

    def __init__(self, app: ASGIApp, *, hsts: bool) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Swagger UI loads its own scripts; a strict policy would blank it.
        strict_csp = not scope["path"].startswith(("/docs", "/redoc"))

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                if strict_csp:
                    headers.setdefault(
                        "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
                    )
                if self.hsts:
                    headers.setdefault(
                        "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)


class OriginCheck:
    """Refuses a state-changing request that carries a session cookie but
    comes from a page on another site.

    The cookies are SameSite=Lax, which already keeps them off most
    cross-site requests; this is the explicit second line, so a browser bug
    or a sibling subdomain does not turn into a forged goal or a forged vote.
    A request with no Origin header is let through: browsers always send one
    on a cross-site POST, so its absence means a script or a server, neither
    of which holds a reader's cookie.
    """

    def __init__(self, app: ASGIApp, *, allowed: Iterable[str], cookies: Iterable[str]) -> None:
        self.app = app
        self.allowed = {o.rstrip("/") for o in allowed}
        self.cookies = tuple(cookies)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in _UNSAFE_METHODS:
            headers = Headers(scope=scope)
            origin = headers.get("origin")
            cookie = headers.get("cookie", "")
            carries_session = any(f"{name}=" in cookie for name in self.cookies)
            if origin and carries_session and origin.rstrip("/") not in self.allowed:
                response = JSONResponse(
                    {"detail": "Το αίτημα προέρχεται από άλλον ιστότοπο."}, status_code=403
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


class LiveCache:
    """A few seconds of shared caching on the endpoints every open page polls.

    On a Sunday afternoon every reader's phone asks for the live strip every
    twenty seconds. `s-maxage` lets the proxy or CDN in front answer most of
    them from one upstream request; `max-age` is kept shorter so a single
    phone still sees a goal within a poll or two. Only successful GETs with no
    session cookie are marked — a response that could differ per person must
    never be shared.
    """

    def __init__(self, app: ASGIApp, *, paths: tuple[str, ...], cookies: Iterable[str]) -> None:
        self.app = app
        self.paths = paths
        self.cookies = tuple(cookies)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "GET"
            or not scope["path"].endswith(self.paths)
        ):
            await self.app(scope, receive, send)
            return
        cookie = Headers(scope=scope).get("cookie", "")
        personal = any(f"{name}=" in cookie for name in self.cookies)

        async def send_with_cache(message: Message) -> None:
            if message["type"] == "http.response.start" and message["status"] == 200:
                headers = MutableHeaders(scope=message)
                headers.setdefault(
                    "Cache-Control",
                    "private, no-store" if personal else "public, max-age=5, s-maxage=10",
                )
            await send(message)

        await self.app(scope, receive, send_with_cache)
