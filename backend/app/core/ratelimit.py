"""Per-address throttling for the endpoints a script would hammer.

Two kinds of target. The logins, where the danger is guessing: the volunteer
lockout is per code, so it neither slows somebody trying many prefixes in
parallel nor stops a stranger locking a club out on purpose. And the polls,
where every voter token is accepted, so without a ceiling a loop can stuff a
ballot one fresh token at a time.

In memory, per process. The API runs as a single uvicorn process, so that is
the whole picture; a second replica would need this moved to Postgres or to
the proxy in front. The counts are lost on restart, which for a window of
minutes costs nothing.

The address is `request.client.host`, never X-Forwarded-For read by hand: a
throttle keyed on a header the client writes is a throttle the client turns
off. Uvicorn rewrites `client` from that header only for the proxies listed in
FORWARDED_ALLOW_IPS, which is where the trust decision belongs.
"""

# No `from __future__ import annotations` here: FastAPI reads the `Request`
# annotation on `__call__` at runtime, and as a string on a callable instance it
# is not resolved — the parameter turns into a required query field instead.

import time
from collections import deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status

#: How often stale addresses are swept, so the table cannot grow for ever
#: under a stream of one-off visitors.
_SWEEP_EVERY = 60.0


class RateLimit:
    """At most `limit` calls per `window` seconds from one address.

    Used as a dependency: `dependencies=[Depends(RateLimit(...))]`. A sliding
    window rather than fixed buckets, so a burst straddling a bucket boundary
    cannot get twice the allowance.
    """

    def __init__(
        self,
        name: str,
        *,
        limit: int,
        window: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.name = name
        self.limit = limit
        self.window = window
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._swept = clock()

    def hit(self, key: str) -> float | None:
        """Record one call. None if allowed, else seconds until the next slot."""
        now = self._clock()
        self._sweep(now)

        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return hits[0] + self.window - now
        hits.append(now)
        return None

    def _sweep(self, now: float) -> None:
        if now - self._swept < _SWEEP_EVERY:
            return
        self._swept = now
        stale = [k for k, v in self._hits.items() if not v or v[-1] <= now - self.window]
        for key in stale:
            del self._hits[key]

    async def __call__(self, request: Request) -> None:
        address = request.client.host if request.client else "unknown"
        wait = self.hit(address)
        if wait is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Πολλές προσπάθειες σε λίγο χρόνο. Δοκίμασε ξανά σε λίγα λεπτά.",
                headers={"Retry-After": str(max(1, int(wait + 0.999)))},
            )


#: Password logins. Ten in five minutes is more than any person mistyping.
login_limit = RateLimit("login", limit=10, window=300)

#: Club-code logins, per address across every prefix — the gap the per-code
#: lockout leaves open.
code_login_limit = RateLimit("code-login", limit=10, window=300)

#: Votes. A household on one Wi-Fi shares an address, so this is generous;
#: it exists to stop a loop, not a family.
vote_limit = RateLimit("vote", limit=30, window=600)
