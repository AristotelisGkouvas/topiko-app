"""Turning a request into an anonymous page view: who (a daily hash), what
page, from where, on what — and nothing that points back at a person."""

from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from app.core.config import settings

_ATHENS = ZoneInfo("Europe/Athens")

#: Crawlers, link unfurlers and headless browsers: not readers.
_BOT = re.compile(
    r"bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|"
    r"embedly|quora|pingdom|uptime|monitor|curl|wget|python-requests|httpx|axios|node-fetch",
    re.IGNORECASE,
)


def is_bot(user_agent: str) -> bool:
    return not user_agent or bool(_BOT.search(user_agent))


def visitor_hash(ip: str, user_agent: str, now: datetime | None = None) -> str:
    """16 hex characters that stay the same for one reader for one Greek day.

    Keyed with the site's secret, so it cannot be recomputed from a guessed
    address, and dated, so tomorrow's hash says nothing about today's.
    """
    day = (now or datetime.now(_ATHENS)).astimezone(_ATHENS).date().isoformat()
    message = f"{day}|{ip}|{user_agent}".encode()
    return hmac.new(settings.secret_key.encode(), message, hashlib.sha256).hexdigest()[:16]


def device_of(user_agent: str) -> tuple[str, str, str]:
    """(device, browser, os) families. Coarse on purpose: a family, never a version."""
    ua = user_agent
    if re.search(r"iPad|Tablet|Tab(?!le)|SM-T|Kindle", ua) or (
        "Android" in ua and "Mobile" not in ua
    ):
        device = "tablet"
    elif re.search(r"Mobi|iPhone|Android", ua):
        device = "mobile"
    else:
        device = "desktop"

    if "Edg/" in ua:
        browser = "Edge"
    elif "SamsungBrowser" in ua:
        browser = "Samsung"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "Firefox/" in ua or "FxiOS" in ua:
        browser = "Firefox"
    elif "Viber" in ua:
        browser = "Viber"
    elif "FBAN" in ua or "FBAV" in ua or "Instagram" in ua:
        browser = "Facebook app"
    elif "Chrome/" in ua or "CriOS" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "Άλλος"

    if "Windows" in ua:
        os_ = "Windows"
    elif re.search(r"iPhone|iPad|iPod", ua):
        os_ = "iOS"
    elif "Android" in ua:
        os_ = "Android"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        os_ = "macOS"
    elif "Linux" in ua:
        os_ = "Linux"
    else:
        os_ = "Άλλο"
    return device, browser, os_


#: Where a visit came from, grouped the way a secretary would say it.
_SOURCES = (
    ("facebook", "Facebook"),
    ("fb.", "Facebook"),
    ("instagram", "Instagram"),
    ("viber", "Viber"),
    ("whatsapp", "WhatsApp"),
    ("t.co", "X/Twitter"),
    ("twitter", "X/Twitter"),
    ("google", "Google"),
    ("bing", "Bing"),
    ("duckduckgo", "DuckDuckGo"),
    ("yahoo", "Yahoo"),
    ("messenger", "Messenger"),
    ("tiktok", "TikTok"),
)


def referrer_host(referrer: str | None, own_hosts: set[str]) -> str | None:
    """The site a visit came from; None for none, or for our own pages."""
    if not referrer:
        return None
    host = (urlsplit(referrer).hostname or "").lower().removeprefix("www.")
    if not host or host in own_hosts:
        return None
    for needle, name in _SOURCES:
        if needle in host:
            return name
    return host[:120]


_ROUTES = (
    (re.compile(r"^/agones/(\d+)(?:/.*)?$"), "/agones/[id]", "match"),
    (re.compile(r"^/somateia/([^/]+)/roster$"), "/somateia/[slug]/roster", "team"),
    (re.compile(r"^/somateia/([^/]+)/analysi$"), "/somateia/[slug]/analysi", "team"),
    (re.compile(r"^/somateia/([^/]+)$"), "/somateia/[slug]", "team"),
    (re.compile(r"^/paiktes/([^/]+)$"), "/paiktes/[slug]", "player"),
    (re.compile(r"^/gipeda/([^/]+)$"), "/gipeda/[slug]", "field"),
    (re.compile(r"^/kontra/([^/]+/[^/]+)$"), "/kontra/[home]/[away]", "h2h"),
)


def classify(url: str) -> tuple[str, str, str | None, dict[str, str]]:
    """(path, route, entity, query) for a visited URL.

    The division a list page is showing lives in ?liga=, so it becomes the
    entity there: "which divisions are read" is one of the questions asked.
    """
    parts = urlsplit(url)
    path = (parts.path or "/").rstrip("/") or "/"
    query = {k: v[0] for k, v in parse_qs(parts.query).items() if v}
    for pattern, route, kind in _ROUTES:
        match = pattern.match(path)
        if match:
            return path[:255], route, f"{kind}:{match.group(1)}"[:160], query
    route = "/" + path.strip("/").split("/")[0] if path != "/" else "/"
    entity = f"league:{query['liga']}"[:160] if query.get("liga") else None
    return path[:255], route[:80], entity, query
