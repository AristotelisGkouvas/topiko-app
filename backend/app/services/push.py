"""Sending notifications.

Web Push, which is the only way to reach a phone that has the site installed
and closed. No third party is involved: the message is encrypted here with the
browser's own keys and handed to whichever push service that browser uses.

Silent when unconfigured. A federation that has not generated VAPID keys
should get a site that works and no notifications, not a stack trace on every
goal.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import PushSubscription
from app.models.enums import MatchEventKind
from app.services.notify_prefs import is_quiet, wants

logger = logging.getLogger(__name__)

#: How many delivery failures before an endpoint is dropped. Push services
#: return 404 or 410 for good — a browser that was uninstalled — but they also
#: fail transiently, and unsubscribing somebody because of one bad afternoon
#: is not recoverable from their side.
MAX_FAILURES = 3


def configured() -> bool:
    return bool(settings.vapid_private_key and settings.vapid_subject)


def _send_one(subscription: PushSubscription, payload: str) -> int | None:
    """Deliver, returning an HTTP status when the service rejected it.

    Imported inside the function: pywebpush pulls in `cryptography`, and a
    deployment that never sends a notification should not pay for loading it.
    """
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            timeout=10,
        )
        return None
    except WebPushException as exc:
        return exc.response.status_code if exc.response is not None else 0


async def notify_team(
    db: AsyncSession,
    *,
    association_id: int,
    team_slugs: list[str],
    title: str,
    body: str,
    url: str | None = None,
    kind: MatchEventKind | None = None,
) -> int:
    """Tell everybody following these clubs. Returns how many were reached.

    Both clubs in a match are notified, because a goal is news to the people
    who follow either of them.

    `kind` is what happened. Without it every subscription is written to, which
    is right for the handful of notices that are not match events — a
    federation announcement — and wrong for everything else.
    """
    if not configured() or not team_slugs:
        return 0

    subscriptions = list(
        (
            await db.execute(
                select(PushSubscription).where(
                    PushSubscription.association_id == association_id,
                    PushSubscription.team_slug.in_(team_slugs),
                    PushSubscription.failures < MAX_FAILURES,
                )
            )
        ).scalars()
    )

    if kind is not None:
        # Filtered here rather than in SQL: the answer depends on a default
        # per group and on the reader's own clock, and encoding either in a
        # WHERE clause puts the rule in two places.
        subscriptions = [
            s
            for s in subscriptions
            if wants(s.prefs, kind)
            and not is_quiet(
                quiet_from=s.quiet_from,
                quiet_to=s.quiet_to,
                utc_offset=s.utc_offset,
            )
        ]

    if not subscriptions:
        return 0

    payload = json.dumps({"title": title, "body": body, "url": url})

    # webpush is blocking and there is one HTTP request per subscriber. Run off
    # the event loop so a slow push service does not hold up the response to
    # whoever just recorded the goal.
    results = await asyncio.gather(
        *(asyncio.to_thread(_send_one, s, payload) for s in subscriptions),
        return_exceptions=True,
    )

    sent = 0
    now = datetime.now(UTC)
    for subscription, outcome in zip(subscriptions, results, strict=True):
        if isinstance(outcome, BaseException):
            subscription.failures += 1
            subscription.failed_at = now
            continue
        if outcome is None:
            sent += 1
            # A delivery clears the history: the endpoint is demonstrably fine.
            subscription.failures = 0
            subscription.failed_at = None
        elif outcome in (404, 410):
            # Gone for good. The browser was uninstalled or cleared.
            await db.delete(subscription)
        else:
            subscription.failures += 1
            subscription.failed_at = now

    logger.info("Push: %d/%d παραδόθηκαν", sent, len(subscriptions))
    return sent
