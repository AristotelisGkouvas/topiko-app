"""Telling Bing (and through it ChatGPT's search) the moment a page changes.

A result scraped at 18:52 is what people search for at 19:00. Left to the
crawler it is found days later; IndexNow hands the changed addresses over as
soon as the run commits. Google does not take part — it reads the sitemap.

Off unless INDEXNOW_KEY and SITE_URL are both set. The site serves the same
key at /indexnow.txt, which is how the search engine knows the ping is ours.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ENDPOINT = "https://api.indexnow.org/indexnow"
#: The protocol's own ceiling per request.
BATCH = 10_000


async def submit(paths: Iterable[str]) -> int:
    """Send site-relative paths; returns how many were accepted for sending.

    Never raises: a search engine being down is not a reason to mark a scrape
    run as failed, and the sitemap catches whatever is missed here.
    """
    key = (settings.indexnow_key or "").strip()
    site = (settings.site_url or "").rstrip("/")
    urls = sorted({f"{site}{p}" for p in paths})
    if not key or not site or not urls:
        return 0

    host = httpx.URL(site).host
    sent = 0
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            for start in range(0, len(urls), BATCH):
                batch = urls[start : start + BATCH]
                response = await client.post(
                    ENDPOINT,
                    json={
                        "host": host,
                        "key": key,
                        "keyLocation": f"{site}/indexnow.txt",
                        "urlList": batch,
                    },
                )
                # 200 and 202 both mean received; anything else is logged and
                # dropped, never retried in a loop against someone else's API.
                if response.status_code not in (200, 202):
                    logger.warning(
                        "IndexNow: %d για %d διευθύνσεις", response.status_code, len(batch)
                    )
                    break
                sent += len(batch)
    except httpx.HTTPError as exc:
        logger.warning("IndexNow: %s", exc)
    if sent:
        logger.info("IndexNow: %d διευθύνσεις", sent)
    return sent
