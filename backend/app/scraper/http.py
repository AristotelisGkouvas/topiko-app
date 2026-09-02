"""Fetching, politely.

These are small volunteer-run federation sites. The whole job is a handful of
pages per hour, so there is no excuse for being anything other than gentle:
identify honestly, obey robots.txt, pause between requests, retry sparingly and
give up quickly.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

logger = logging.getLogger(__name__)

DEFAULT_DELAY_SECONDS = 2.0
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_ATTEMPTS = 3
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


class FetchError(RuntimeError):
    pass


class DisallowedByRobots(FetchError):
    """robots.txt says no. Never retried, never worked around."""


@dataclass(slots=True)
class Fetcher:
    """One-per-run HTTP client, scoped to a single site.

    Sequential by design: concurrency would buy nothing here except a heavier
    load on somebody else's server.
    """

    base_url: str
    user_agent: str
    delay_seconds: float = DEFAULT_DELAY_SECONDS
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS

    request_count: int = field(default=0, init=False)
    _client: httpx.AsyncClient | None = field(default=None, init=False)
    _robots: RobotFileParser | None = field(default=None, init=False)
    _first_request: bool = field(default=True, init=False)

    def __post_init__(self) -> None:
        # Caught here rather than deep inside httpx, where it surfaces as a bare
        # UnicodeEncodeError with a byte offset and no hint about which header.
        try:
            self.user_agent.encode("latin-1")
        except UnicodeEncodeError as exc:
            raise ValueError(
                "SCRAPER_USER_AGENT must be ASCII — HTTP headers cannot carry "
                f"Greek text: {self.user_agent!r}"
            ) from exc

    async def __aenter__(self) -> Fetcher:
        self._client = httpx.AsyncClient(
            timeout=self.timeout_seconds,
            follow_redirects=True,
            headers={
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "el-GR,el;q=0.9",
            },
        )
        await self._load_robots()
        return self

    async def __aexit__(self, *_: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _load_robots(self) -> None:
        """Read robots.txt once per run.

        A missing or unreadable robots.txt is treated as permission — that is
        the standard reading — but a robots.txt that loads and says no is
        final.
        """
        assert self._client is not None
        url = urljoin(self.base_url, "/robots.txt")
        parser = RobotFileParser()
        try:
            response = await self._client.get(url)
            self.request_count += 1
            if response.status_code == 200:
                parser.parse(response.text.splitlines())
            else:
                parser.allow_all = True
        except httpx.HTTPError as exc:
            logger.warning("robots.txt unreachable at %s (%s); assuming allowed", url, exc)
            parser.allow_all = True
        self._robots = parser

    def _may_fetch(self, url: str) -> bool:
        if self._robots is None:
            return True
        # The parser wants the agent token, not the full product string.
        token = self.user_agent.split("/")[0]
        return self._robots.can_fetch(token, url)

    async def get(self, path: str) -> str:
        """Fetch one page and return its text.

        Raises DisallowedByRobots when robots.txt forbids the path, and
        FetchError once the retries are spent.
        """
        if self._client is None:
            raise RuntimeError("Fetcher must be used as an async context manager")

        url = urljoin(self.base_url, path)
        if urlparse(url).netloc != urlparse(self.base_url).netloc:
            raise FetchError(f"Refusing to leave {self.base_url}: {url}")
        if not self._may_fetch(url):
            raise DisallowedByRobots(f"robots.txt disallows {url}")

        # Pause before every request except the very first, so a run of N pages
        # costs N-1 delays rather than N.
        if not self._first_request:
            await asyncio.sleep(self.delay_seconds)
        self._first_request = False

        last_error: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = await self._client.get(url)
                self.request_count += 1
                if response.status_code not in RETRY_STATUSES:
                    # Whatever else the server said is an answer rather than a
                    # hiccup: a 404 will not become a 200 on the second ask.
                    response.raise_for_status()
                    # The federation sites declare UTF-8 correctly; trusting the
                    # declared charset avoids httpx guessing on short pages.
                    return response.text
                last_error = FetchError(f"HTTP {response.status_code} for {url}")
            except httpx.HTTPStatusError as exc:
                raise FetchError(f"HTTP {exc.response.status_code} for {url}") from exc
            except httpx.HTTPError as exc:
                last_error = exc

            if attempt < MAX_ATTEMPTS:
                # Linear, not exponential: three tries at a couple of seconds is
                # the right amount of patience for a site that is either up or
                # down. Nothing follows the last attempt, so nothing waits for
                # it either — that pause only delayed the error report, and on a
                # backfill it did so once per unreachable page.
                await asyncio.sleep(self.delay_seconds * attempt)

        raise FetchError(f"Giving up on {url} after {MAX_ATTEMPTS} attempts: {last_error}")
