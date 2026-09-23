"""Subscribing to notifications about a club.

Public and unauthenticated, like following a club is. Readers have no accounts
here, so a subscription is a browser rather than a person — which also means
there is no list to leak: the endpoint is an opaque address issued by the
reader's own push service and useful to nobody else.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import CurrentAssociation, DbSession
from app.core.config import settings
from app.models import PushSubscription, Team
from app.services.push import configured

router = APIRouter(prefix="/api/v1", tags=["push"])


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=600)
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=6, max_length=100)
    team_slug: str = Field(min_length=1, max_length=120)


class PushConfigOut(BaseModel):
    enabled: bool
    #: The application server key the browser needs to subscribe. Public by
    #: design — it is how a push service checks the sender is us.
    public_key: str | None = None


@router.get("/{association_slug}/push/config", response_model=PushConfigOut)
async def push_config(association: CurrentAssociation) -> PushConfigOut:
    """Whether notifications are available, and the key to subscribe with.

    Asked before the button is shown: offering "get notified" on a deployment
    with no keys produces a permission prompt and then silence, which is worse
    than not offering it.
    """
    return PushConfigOut(
        enabled=configured(),
        public_key=settings.vapid_public_key if configured() else None,
    )


@router.post(
    "/{association_slug}/push/subscribe", status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def subscribe(
    association: CurrentAssociation, payload: SubscriptionIn, db: DbSession
) -> None:
    if not configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Οι ειδοποιήσεις δεν είναι ρυθμισμένες σε αυτόν τον server.",
        )

    exists = (
        await db.execute(
            select(Team.id).where(
                Team.association_id == association.id, Team.slug == payload.team_slug
            )
        )
    ).scalar_one_or_none()
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε σωματείο '{payload.team_slug}'.",
        )

    # Upsert: a browser that re-subscribes — which it does whenever the push
    # service rotates its endpoint — must not accumulate rows, and its keys
    # change with the endpoint.
    await db.execute(
        insert(PushSubscription)
        .values(
            association_id=association.id,
            endpoint=payload.endpoint,
            p256dh=payload.p256dh,
            auth=payload.auth,
            team_slug=payload.team_slug,
        )
        .on_conflict_do_update(
            constraint="uq_push_endpoint_team",
            set_={
                "p256dh": payload.p256dh,
                "auth": payload.auth,
                # A fresh subscription is a working one, whatever happened to
                # the previous endpoint.
                "failures": 0,
                "failed_at": None,
            },
        )
    )
    await db.commit()


class UnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=20, max_length=600)
    #: Omitted to stop everything for this browser, which is what a reader
    #: means by turning notifications off.
    team_slug: str | None = Field(default=None, max_length=120)


@router.post(
    "/{association_slug}/push/unsubscribe",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def unsubscribe(
    association: CurrentAssociation, payload: UnsubscribeIn, db: DbSession
) -> None:
    stmt = delete(PushSubscription).where(
        PushSubscription.association_id == association.id,
        PushSubscription.endpoint == payload.endpoint,
    )
    if payload.team_slug:
        stmt = stmt.where(PushSubscription.team_slug == payload.team_slug)
    await db.execute(stmt)
    await db.commit()
