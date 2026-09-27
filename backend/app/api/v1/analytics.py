"""Anonymous site statistics: collecting them, and the admin's summary.

Collecting is public — the reader's browser reports what it showed — but only
from our own pages, as JSON, rate-limited, and never from crawlers, headless
browsers or readers who send Global Privacy Control. See app.models.analytics
for what is stored and, more to the point, what is not.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import Float, Integer, cast, func, select, text

from app.api.auth_deps import CurrentAdmin, EditableAssociation
from app.api.deps import CurrentAssociation, DbSession
from app.core.config import settings
from app.core.ratelimit import RateLimit
from app.models import (
    AnalyticsEvent,
    League,
    Match,
    MatchEvent,
    MatchPrediction,
    MvpPoll,
    MvpVote,
    PageView,
    Player,
    PlatformSponsor,
    PushSubscription,
    ScrapeRun,
    Sponsor,
    SponsorDailyStat,
    Team,
)
from app.models.enums import ScrapeRunStatus
from app.services import analytics as an

router = APIRouter(prefix="/api/v1", tags=["analytics"])

_ATHENS = ZoneInfo("Europe/Athens")

view_limit = RateLimit("analytics-views", limit=60, window=60)
event_limit = RateLimit("analytics-events", limit=120, window=60)

#: What a page may report. Anything else is refused rather than stored: the
#: list is the whole of what this site collects, readable in one place.
EVENTS = {
    "share",  # the share sheet or copied link
    "directions",  # directions to a ground
    "story",  # downloaded the 9:16 match image
    "table_image",  # downloaded the standings image
    "copy_text",  # copied a round or table as text
    "calendar",  # added a club's fixtures to a calendar
    "follow",  # made a club "my club"
    "unfollow",
    "search",  # typed a search
    "notify_on",  # turned on notifications
    "notify_off",
    "install_prompt",  # the install card was shown / accepted
    "installed",
    "theme",  # switched light/dark
    "readability",  # large text / high contrast
    "prediction",  # voted 1/X/2
    "mvp_vote",
    "outbound",  # a link off the site (not sponsors, which count themselves)
    "js_error",
    "vital",  # a Core Web Vital measurement
    "not_found",  # a page that does not exist
}


def _guard(request: Request) -> tuple[str, str] | None:
    """(ip, ua) when this request should be counted; None to drop it quietly.

    Refusals that matter (foreign origin, not JSON) are errors; a bot or a
    reader asking not to be tracked is simply not counted.
    """
    if not request.headers.get("content-type", "").startswith("application/json"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Μόνο JSON.")
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Άλλος ιστότοπος.")
    ua = request.headers.get("user-agent", "")
    if an.is_bot(ua) or request.headers.get("sec-gpc") == "1":
        return None
    ip = request.client.host if request.client else "unknown"
    return ip, ua


def _own_hosts() -> set[str]:
    hosts = {h.lower().removeprefix("www.") for h in settings.allowed_hosts if h != "*"}
    for origin in settings.cors_origins:
        host = origin.split("://")[-1].split(":")[0].lower().removeprefix("www.")
        hosts.add(host)
    return hosts


# --- Collecting ---------------------------------------------------------------


class ViewIn(BaseModel):
    url: str = Field(max_length=500)
    referrer: str | None = Field(default=None, max_length=500)
    viewport_width: int | None = Field(default=None, ge=0, le=10000)
    dark: bool | None = None
    installed: bool | None = None
    lang: str | None = Field(default=None, max_length=12)


class ViewOut(BaseModel):
    id: int | None


@router.post(
    "/{association_slug}/analytics/view",
    response_model=ViewOut,
    dependencies=[Depends(view_limit)],
)
async def record_view(
    association: CurrentAssociation, payload: ViewIn, request: Request, db: DbSession
) -> ViewOut:
    who = _guard(request)
    if who is None:
        return ViewOut(id=None)
    ip, ua = who
    path, route, entity, query = an.classify(payload.url)
    if route.startswith("/admin"):
        # The office at work is not readership.
        return ViewOut(id=None)
    device, browser, os_ = an.device_of(ua)
    view = PageView(
        association_id=association.id,
        path=path,
        route=route,
        entity=entity,
        visitor=an.visitor_hash(ip, ua),
        referrer_host=an.referrer_host(payload.referrer, _own_hosts()),
        utm_source=(query.get("utm_source") or None) and query["utm_source"][:80],
        utm_medium=(query.get("utm_medium") or None) and query["utm_medium"][:80],
        utm_campaign=(query.get("utm_campaign") or None) and query["utm_campaign"][:120],
        device=device,
        browser=browser,
        os=os_,
        lang=(payload.lang or "")[:12] or None,
        viewport_width=payload.viewport_width,
        dark=payload.dark,
        installed=payload.installed,
    )
    db.add(view)
    await db.commit()
    return ViewOut(id=view.id)


class LeaveIn(BaseModel):
    id: int
    duration_ms: int = Field(ge=0, le=6 * 60 * 60 * 1000)
    scroll_pct: int = Field(ge=0, le=100)


@router.post(
    "/{association_slug}/analytics/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(view_limit)],
)
async def record_leave(
    association: CurrentAssociation, payload: LeaveIn, request: Request, db: DbSession
) -> Response:
    """How long the page was open and how far down it was read. Only for the
    reader's own view of today, and only once."""
    who = _guard(request)
    if who is not None:
        view = await db.get(PageView, payload.id)
        if (
            view is not None
            and view.association_id == association.id
            and view.visitor == an.visitor_hash(*who)
            and view.duration_ms is None
        ):
            view.duration_ms = payload.duration_ms
            view.scroll_pct = payload.scroll_pct
            await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class EventIn(BaseModel):
    name: str = Field(max_length=40)
    path: str | None = Field(default=None, max_length=255)
    props: dict[str, Any] | None = None


@router.post(
    "/{association_slug}/analytics/event",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(event_limit)],
)
async def record_event(
    association: CurrentAssociation, payload: EventIn, request: Request, db: DbSession
) -> Response:
    if payload.name not in EVENTS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Άγνωστο γεγονός.")
    who = _guard(request)
    if who is not None:
        props = payload.props or {}
        # Small and flat: a search term or an error message, not a document.
        if len(json.dumps(props, ensure_ascii=False)) > 600:
            props = {k: str(v)[:120] for k, v in list(props.items())[:6]}
        db.add(
            AnalyticsEvent(
                association_id=association.id,
                name=payload.name,
                path=(payload.path or "")[:255] or None,
                visitor=an.visitor_hash(*who),
                props=props or None,
            )
        )
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- The admin's summary ---------------------------------------------------------


class Counted(BaseModel):
    key: str
    label: str
    count: int
    visitors: int | None = None


class DayPoint(BaseModel):
    day: date
    views: int
    visitors: int


class Vital(BaseModel):
    name: str
    p75: float
    count: int


class SponsorLine(BaseModel):
    name: str
    kind: str
    views: int
    clicks: int


class Totals(BaseModel):
    views: int
    #: Daily unique readers, added up over the days — the hash changes daily,
    #: so the same person on two days counts twice, by design.
    visitors: int
    avg_seconds: float | None
    avg_scroll: float | None
    installed_share: float | None
    dark_share: float | None
    views_per_visitor: float | None


class Scraper(BaseModel):
    last_run_at: datetime | None
    last_status: str | None
    runs: int
    failures: int


class AnalyticsOut(BaseModel):
    days: int
    since: date
    totals: Totals
    per_day: list[DayPoint]
    hours: list[int]
    weekdays: list[int]
    routes: list[Counted]
    matches: list[Counted]
    teams: list[Counted]
    leagues: list[Counted]
    players: list[Counted]
    referrers: list[Counted]
    campaigns: list[Counted]
    devices: list[Counted]
    browsers: list[Counted]
    oses: list[Counted]
    langs: list[Counted]
    widths: list[Counted]
    events: list[Counted]
    searches: list[Counted]
    follows: list[Counted]
    shares: list[Counted]
    errors: list[Counted]
    not_found: list[Counted]
    vitals: list[Vital]
    predictions: int
    mvp_votes: int
    mvp_polls: int
    push_subscriptions: int
    live_events: list[Counted]
    sponsors: list[SponsorLine]
    scraper: Scraper


_ROUTE_LABELS = {
    "/": "Αρχική",
    "/agones": "Αγώνες (λίστα)",
    "/agones/[id]": "Σελίδα αγώνα",
    "/vathmologia": "Βαθμολογία",
    "/skorer": "Σκόρερ",
    "/somateia": "Σωματεία (λίστα)",
    "/somateia/[slug]": "Σελίδα σωματείου",
    "/somateia/[slug]/roster": "Ρόστερ",
    "/somateia/[slug]/analysi": "Ανάλυση αντιπάλου",
    "/paiktes": "Παίκτες (αναζήτηση)",
    "/paiktes/[slug]": "Σελίδα παίκτη",
    "/gipeda": "Γήπεδα (λίστα)",
    "/gipeda/[slug]": "Σελίδα γηπέδου",
    "/kontra/[home]/[away]": "Κόντρα",
    "/sygkrisi": "Σύγκριση",
    "/rekor": "Ρεκόρ",
    "/san-simera": "Σαν σήμερα",
    "/poines": "Ποινές",
    "/mvp": "MVP",
    "/anakoinoseis": "Ανακοινώσεις",
    "/anazitisi": "Αναζήτηση",
    "/eidopoiiseis": "Ειδοποιήσεις",
    "/perissotera": "Περισσότερα",
    "/sxetika": "Σχετικά",
    "/kalosorisma": "Καλωσόρισμα",
    "/ethelontis": "Live από το γήπεδο",
    "/embed": "Ενσωμάτωση σε άλλο site",
}


def _counted(rows, labels: dict[str, str] | None = None) -> list[Counted]:
    out = []
    for row in rows:
        key = str(row[0]) if row[0] is not None else "—"
        out.append(
            Counted(
                key=key,
                label=(labels or {}).get(key, key),
                count=int(row[1]),
                visitors=int(row[2]) if len(row) > 2 and row[2] is not None else None,
            )
        )
    return out


@router.get("/{association_slug}/editor/analytics", response_model=AnalyticsOut)
async def analytics_summary(
    association: EditableAssociation,
    _: CurrentAdmin,
    db: DbSession,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> AnalyticsOut:
    """Everything the site knows about its readership, for the last `days`."""
    now = datetime.now(UTC)
    since_day = now.astimezone(_ATHENS).date() - timedelta(days=days - 1)
    since = datetime.combine(since_day, datetime.min.time(), tzinfo=_ATHENS)
    aid = association.id
    pv = select(PageView).where(PageView.association_id == aid, PageView.at >= since).subquery()
    local = func.timezone("Europe/Athens", pv.c.at)

    async def rows(stmt):
        return (await db.execute(stmt)).all()

    async def top(column, limit=12, where=None):
        stmt = select(column, func.count(), func.count(func.distinct(pv.c.visitor))).select_from(pv)
        if where is not None:
            stmt = stmt.where(where)
        return await rows(stmt.where(column.is_not(None)).group_by(column).order_by(func.count().desc()).limit(limit))

    total = (
        await db.execute(
            select(
                func.count(),
                func.avg(pv.c.duration_ms),
                func.avg(pv.c.scroll_pct),
                func.avg(cast(pv.c.installed, Integer)),
                func.avg(cast(pv.c.dark, Integer)),
            ).select_from(pv)
        )
    ).one()
    per_day_rows = await rows(
        select(func.date(local), func.count(), func.count(func.distinct(pv.c.visitor)))
        .select_from(pv)
        .group_by(func.date(local))
        .order_by(func.date(local))
    )
    by_day = {d: (v, u) for d, v, u in per_day_rows}
    per_day = [
        DayPoint(day=since_day + timedelta(days=i), views=by_day.get(since_day + timedelta(days=i), (0, 0))[0],
                 visitors=by_day.get(since_day + timedelta(days=i), (0, 0))[1])
        for i in range(days)
    ]
    visitors = sum(p.visitors for p in per_day)

    hours = [0] * 24
    for hour, n in await rows(
        select(func.extract("hour", local), func.count()).select_from(pv).group_by(func.extract("hour", local))
    ):
        hours[int(hour)] = int(n)
    weekdays = [0] * 7  # Monday first
    for dow, n in await rows(
        select(func.extract("isodow", local), func.count()).select_from(pv).group_by(func.extract("isodow", local))
    ):
        weekdays[int(dow) - 1] = int(n)

    # Entities, named.
    async def entity_top(kind: str, limit=10):
        return await top(pv.c.entity, limit, pv.c.entity.like(f"{kind}:%"))

    match_rows = await entity_top("match")
    ids = [int(r[0].split(":")[1]) for r in match_rows if r[0].split(":")[1].isdigit()]
    names: dict[str, str] = {}
    if ids:
        for m in (await db.execute(select(Match).where(Match.id.in_(ids)))).scalars():
            home = await db.get(Team, m.home_team_id)
            away = await db.get(Team, m.away_team_id)
            names[f"match:{m.id}"] = f"{home.name if home else '?'} – {away.name if away else '?'}"
    team_rows = await entity_top("team")
    slugs = [r[0].split(":", 1)[1] for r in team_rows]
    for t in (await db.execute(select(Team).where(Team.association_id == aid, Team.slug.in_(slugs)))).scalars():
        names[f"team:{t.slug}"] = t.name
    league_rows = await entity_top("league")
    lslugs = [r[0].split(":", 1)[1] for r in league_rows]
    for lg in (await db.execute(select(League).where(League.association_id == aid, League.slug.in_(lslugs)))).scalars():
        names.setdefault(f"league:{lg.slug}", lg.short_name or lg.name)
    player_rows = await entity_top("player")
    pslugs = [r[0].split(":", 1)[1] for r in player_rows]
    for p in (await db.execute(select(Player).where(Player.association_id == aid, Player.slug.in_(pslugs)))).scalars():
        names[f"player:{p.slug}"] = p.name

    ev = select(AnalyticsEvent).where(AnalyticsEvent.association_id == aid, AnalyticsEvent.at >= since).subquery()

    async def event_prop(name: str, prop: str, limit=15):
        value = ev.c.props[prop].astext
        return await rows(
            select(value, func.count(), func.count(func.distinct(ev.c.visitor)))
            .select_from(ev)
            .where(ev.c.name == name, value.is_not(None))
            # By position: the JSON path is bound as a parameter, and to
            # PostgreSQL two bindings of it are two different expressions.
            .group_by(text("1"))
            .order_by(func.count().desc())
            .limit(limit)
        )

    vitals = [
        Vital(name=n, p75=float(p or 0), count=int(c))
        for n, p, c in await rows(
            select(
                ev.c.props["name"].astext,
                func.percentile_cont(0.75).within_group(cast(ev.c.props["value"].astext, Float)),
                func.count(),
            )
            .select_from(ev)
            .where(ev.c.name == "vital")
            .group_by(text("1"))
        )
    ]

    follow_rows = await event_prop("follow", "team")
    for t in (
        await db.execute(
            select(Team).where(Team.association_id == aid, Team.slug.in_([r[0] for r in follow_rows]))
        )
    ).scalars():
        names[t.slug] = t.name

    # Engagement the site already stores, over the same period.
    predictions = await db.scalar(
        select(func.count()).select_from(MatchPrediction).join(Match, MatchPrediction.match_id == Match.id)
        .join(League, Match.league_id == League.id)
        .where(League.association_id == aid, MatchPrediction.created_at >= since)
    ) or 0
    mvp_votes = await db.scalar(
        select(func.count()).select_from(MvpVote).join(MvpPoll, MvpVote.poll_id == MvpPoll.id)
        .where(MvpPoll.association_id == aid, MvpVote.created_at >= since)
    ) or 0
    mvp_polls = await db.scalar(
        select(func.count()).select_from(MvpPoll).where(MvpPoll.association_id == aid, MvpPoll.created_at >= since)
    ) or 0
    push_subscriptions = await db.scalar(
        select(func.count()).select_from(PushSubscription).where(PushSubscription.association_id == aid)
    ) or 0
    live_rows = await rows(
        select(Team.name, func.count())
        .select_from(MatchEvent)
        .join(Match, MatchEvent.match_id == Match.id)
        .join(League, Match.league_id == League.id)
        .join(Team, MatchEvent.team_id == Team.id)
        .where(League.association_id == aid, MatchEvent.created_at >= since)
        .group_by(Team.name)
        .order_by(func.count().desc())
        .limit(10)
    )

    # Sponsors, both kinds, over the period.
    sponsor_rows = await rows(
        select(SponsorDailyStat.kind, SponsorDailyStat.ref_id, func.sum(SponsorDailyStat.views), func.sum(SponsorDailyStat.clicks))
        .where(SponsorDailyStat.association_id == aid, SponsorDailyStat.day >= since_day)
        .group_by(SponsorDailyStat.kind, SponsorDailyStat.ref_id)
        .order_by(func.sum(SponsorDailyStat.views).desc())
        .limit(20)
    )
    sponsor_names: dict[tuple[str, int], str] = {}
    pids = [r[1] for r in sponsor_rows if r[0] == "platform"]
    cids = [r[1] for r in sponsor_rows if r[0] == "club"]
    if pids:
        for s in (await db.execute(select(PlatformSponsor).where(PlatformSponsor.id.in_(pids)))).scalars():
            sponsor_names[("platform", s.id)] = s.name
    if cids:
        for cs in (await db.execute(select(Sponsor).where(Sponsor.id.in_(cids)))).scalars():
            sponsor_names[("club", cs.id)] = cs.name
    sponsors = [
        SponsorLine(name=sponsor_names.get((k, i), f"#{i} (διαγράφηκε)"), kind=k, views=int(v or 0), clicks=int(c or 0))
        for k, i, v, c in sponsor_rows
    ]

    runs = await rows(
        select(ScrapeRun.status, func.count())
        .where(ScrapeRun.association_id == aid, ScrapeRun.started_at >= since)
        .group_by(ScrapeRun.status)
    )
    last = (
        await db.execute(
            select(ScrapeRun.started_at, ScrapeRun.status)
            .where(ScrapeRun.association_id == aid)
            .order_by(ScrapeRun.started_at.desc())
            .limit(1)
        )
    ).first()

    width_bucket = func.floor(pv.c.viewport_width / 100) * 100
    views, avg_ms, avg_scroll, installed, dark = total
    return AnalyticsOut(
        days=days,
        since=since_day,
        totals=Totals(
            views=int(views or 0),
            visitors=visitors,
            avg_seconds=round(float(avg_ms) / 1000, 1) if avg_ms is not None else None,
            avg_scroll=round(float(avg_scroll), 1) if avg_scroll is not None else None,
            installed_share=round(float(installed), 3) if installed is not None else None,
            dark_share=round(float(dark), 3) if dark is not None else None,
            views_per_visitor=round(int(views or 0) / visitors, 2) if visitors else None,
        ),
        per_day=per_day,
        hours=hours,
        weekdays=weekdays,
        routes=_counted(await top(pv.c.route, 30), _ROUTE_LABELS),
        matches=_counted(match_rows, names),
        teams=_counted(team_rows, names),
        leagues=_counted(league_rows, names),
        players=_counted(player_rows, names),
        referrers=_counted(await top(pv.c.referrer_host, 15)),
        campaigns=_counted(await top(func.concat_ws(" / ", pv.c.utm_source, pv.c.utm_campaign), 10, pv.c.utm_source.is_not(None))),
        devices=_counted(await top(pv.c.device), {"mobile": "Κινητό", "tablet": "Tablet", "desktop": "Υπολογιστής"}),
        browsers=_counted(await top(pv.c.browser)),
        oses=_counted(await top(pv.c.os)),
        langs=_counted(await top(pv.c.lang, 8)),
        widths=_counted(await top(width_bucket, 12)),
        events=_counted(
            await rows(
                select(ev.c.name, func.count(), func.count(func.distinct(ev.c.visitor)))
                .select_from(ev)
                .where(ev.c.name.not_in(["vital", "js_error"]))
                .group_by(ev.c.name)
                .order_by(func.count().desc())
            )
        ),
        searches=_counted(await event_prop("search", "q")),
        follows=_counted(follow_rows, names),
        shares=_counted(await event_prop("share", "what")),
        errors=_counted(await event_prop("js_error", "message", 10)),
        not_found=_counted(await event_prop("not_found", "path", 10)),
        vitals=vitals,
        predictions=predictions,
        mvp_votes=mvp_votes,
        mvp_polls=mvp_polls,
        push_subscriptions=push_subscriptions,
        live_events=_counted(live_rows),
        sponsors=sponsors,
        scraper=Scraper(
            last_run_at=last[0] if last else None,
            last_status=last[1].value if last else None,
            runs=sum(int(n) for _, n in runs),
            failures=sum(int(n) for s, n in runs if s == ScrapeRunStatus.FAILED),
        ),
    )
