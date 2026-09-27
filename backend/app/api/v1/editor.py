"""The write side.

Everything here hangs off /api/v1/{association_slug}/editor, so "can this
request change data?" is answerable from the URL alone — which is what
public.py's own docstring promised phase 3 would do.

Two gates, not one. Reaching an association at all is `require_association_access`.
Changing a score while the match is being played needs `can_edit_live` on top,
because a live edit outranks the federation's own result for 48 hours under the
reconciliation rules, and that is a different amount of trust from correcting
last month's typo.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import aliased, selectinload

from app.api.auth_deps import CurrentUser, EditableAssociation, may_edit_live
from app.api.deps import CurrentSeason, DbSession
from app.api.lookups import MATCH_LOADS, match_in
from app.models import (
    Association,
    MvpVote,
    LeagueTeam,
    ScrapeRun,
    AuditLog,
    ClubAccessCode,
    Field,
    League,
    Match,
    MatchEvent,
    MvpCandidate,
    MvpPoll,
    Player,
    Team,
    User,
)
from app.models.enums import DataSource, FieldSurface, MatchStatus, UserRole
from app.schemas import FieldOut, MatchOut
from app.services import search as search_service
from app.services import volunteer as volunteer_service
from app.services.audit import changed_fields, record
from app.services.live import LIVE_LEAD, LIVE_WINDOW, live_window
from app.services.standings import recompute_standings
from app.schemas.polls import MvpAdminCandidateOut, MvpPollAdminOut, MvpPollCreatedOut, MvpPollIn
from app.schemas.editor import (
    AuditEntryOut,
    ClubCodeOut,
    FieldEdit,
    IssueCodeIn,
    IssuedCodeOut,
    MatchEdit,
    ScrapeRunOut,
)

router = APIRouter(prefix="/api/v1", tags=["editor"])


def _is_live_window(match: Match, now: datetime) -> bool:
    if match.is_live or match.status in (MatchStatus.LIVE, MatchStatus.HALFTIME):
        return True
    if match.kickoff_at is None:
        return False
    return (
        match.kickoff_at - LIVE_LEAD
        <= now
        <= match.kickoff_at + LIVE_WINDOW
    )


#: Fields whose change can move a team's points, and so the table.
_TABLE_FIELDS = ("home_score", "away_score", "status")

#: A generous box around Epirus and its borders, for a sanity check on a pin.
_EPIRUS_LAT = (38.5, 40.6)
_EPIRUS_LON = (19.5, 21.8)

_SCORE_FIELDS = ("home_score", "away_score", "home_score_ht", "away_score_ht")


def _implied_status(match: Match, changes: dict[str, Any], now: datetime) -> MatchStatus | None:
    """The status a typed score implies, when the editor did not send one.

    A full-time score on a fixture still marked SCHEDULED would never count:
    the table only reads finished matches, and nothing else would move it. So a
    score for both sides on a scheduled match is a result — FINISHED once the
    clock says it is over, LIVE while it could still be running.
    """
    if "status" in changes or match.status is not MatchStatus.SCHEDULED:
        return None
    if match.home_score is None or match.away_score is None:
        return None
    return MatchStatus.LIVE if live_window(match.kickoff_at, now) else MatchStatus.FINISHED


def _snapshot(match: Match) -> dict[str, Any]:
    return {
        "home_score": match.home_score,
        "away_score": match.away_score,
        "home_score_ht": match.home_score_ht,
        "away_score_ht": match.away_score_ht,
        "status": match.status.value,
        "minute": match.minute,
        "referee": match.referee,
        "note": match.note,
        "is_live": match.is_live,
        "data_source": match.data_source.value,
        "kickoff_at": match.kickoff_at.isoformat() if match.kickoff_at else None,
        "field_id": match.field_id,
    }


@router.get(
    "/{association_slug}/editor/matches", response_model=list[MatchOut]
)
async def list_editable_matches(
    association: EditableAssociation,
    db: DbSession,
    days: Annotated[int, Query(ge=1, le=30)] = 3,
    q: Annotated[str | None, Query(max_length=80)] = None,
    league: Annotated[str | None, Query(max_length=120)] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
) -> list[Match]:
    """The matches worth looking at right now: the last few days and the next
    few. An editor opens this to type in a weekend, not to browse the archive.

    `q` narrows to a club (accent-blind), `league` to one division. The cap is
    generous on purpose: fifteen divisions put ~90 matches in one weekend, and
    a cap of 60 used to drop the last of them without a word.
    """
    now = datetime.now(UTC)
    stmt = (
        select(Match)
        .options(*MATCH_LOADS)
        .join(League, Match.league_id == League.id)
        .where(
            League.association_id == association.id,
            Match.kickoff_at.is_not(None),
            Match.kickoff_at >= now - timedelta(days=days),
            Match.kickoff_at <= now + timedelta(days=days),
        )
    )
    if league:
        stmt = stmt.where(League.slug == league)
    needle = search_service.fold(q.strip()) if q else ""
    if needle:
        home = aliased(Team)
        away = aliased(Team)
        stmt = (
            stmt.join(home, Match.home_team_id == home.id)
            .join(away, Match.away_team_id == away.id)
            .where(
                or_(
                    search_service.folded(home.name).contains(needle),
                    search_service.folded(away.name).contains(needle),
                )
            )
        )
    result = await db.execute(stmt.order_by(Match.kickoff_at, Match.id).limit(limit))
    return list(result.scalars())


@router.patch(
    "/{association_slug}/editor/matches/{match_id}", response_model=MatchOut
)
async def edit_match(
    association: EditableAssociation,
    user: CurrentUser,
    match_id: int,
    payload: MatchEdit,
    request: Request,
    db: DbSession,
) -> Match:
    match = await match_in(db, association.id, match_id, *MATCH_LOADS)

    now = datetime.now(UTC)
    if _is_live_window(match, now) and not may_edit_live(user, association):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Δεν έχεις δικαίωμα διόρθωσης σκορ σε αγώνα που παίζεται. "
                "Ζήτησέ το από διαχειριστή."
            ),
        )

    before = _snapshot(match)
    # exclude_unset, not exclude_none: an editor clearing a score sends null on
    # purpose, and treating that as "no change" would make a mistyped result
    # impossible to take back.
    changes = payload.model_dump(exclude_unset=True)
    confirmed = changes.pop("confirmed", None)

    scores_touched = any(key in changes for key in _SCORE_FIELDS)

    if scores_touched:
        # Once somebody has logged the match, the log is the score: the next
        # event recomputes it and would silently wipe a typed one. So the two
        # are not allowed to disagree — the correction goes through the sheet.
        has_events = (
            await db.execute(select(exists().where(MatchEvent.match_id == match.id)))
        ).scalar_one()
        if has_events:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Ο αγώνας έχει καταγεγραμμένα γεγονότα και το σκορ βγαίνει "
                    "από αυτά. Διόρθωσέ το από το φύλλο αγώνα (αναίρεση ή "
                    "προσθήκη γκολ)."
                ),
            )

        typed_a_score = any(changes.get(key) is not None for key in _SCORE_FIELDS)
        if typed_a_score and match.kickoff_at is not None and match.kickoff_at > now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ο αγώνας δεν έχει ξεκινήσει ακόμη· δεν μπορεί να έχει σκορ.",
            )

    rescheduled = "kickoff_at" in changes or "field_id" in changes
    if changes.get("field_id") is not None:
        venue = await db.get(Field, changes["field_id"])
        if venue is None or venue.association_id != association.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Δεν βρέθηκε το γήπεδο.",
            )
        # The object as well as the id, so the response shows the new ground.
        match.field = venue
    if changes.get("kickoff_at") is not None and changes["kickoff_at"].tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Η ώρα έναρξης χρειάζεται ζώνη ώρας.",
        )

    for key, value in changes.items():
        setattr(match, key, value)

    if (match.home_score is None) != (match.away_score is None):
        # Half a score is not a result: it dropped the match from the table
        # and left "ΤΕΛΙΚΟ" over an empty scoreboard.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Χρειάζονται και τα δύο σκορ — ή κανένα.",
        )
    if (
        "status" not in changes
        and match.home_score is None
        and match.status in (MatchStatus.FINISHED, MatchStatus.LIVE, MatchStatus.HALFTIME)
    ):
        # A result taken back entirely: the fixture waits for one again.
        match.status = MatchStatus.SCHEDULED
        match.is_live = False

    implied = _implied_status(match, changes, now)
    if implied is not None:
        match.status = implied
        match.is_live = implied is MatchStatus.LIVE

    if rescheduled:
        # Holds the new date against the scraper; see RESCHEDULE in decisions.
        match.rescheduled_at = now

    if scores_touched or confirmed is not None:
        match.last_manual_edit_at = now
        # Confirmed means somebody checked it against the sheet and pressed ✓
        # to say so — nothing else. A plain entry used to become "confirmed"
        # just because the match was over, and then the public page claimed a
        # check nobody had made. The scraper defers to both, but only until the
        # window in Match.scraper_may_overwrite runs out.
        match.data_source = (
            DataSource.MANUAL_CONFIRMED if confirmed else DataSource.MANUAL_LIVE
        )

    old, new = changed_fields(before, _snapshot(match))
    if not old and not new:
        return match

    record(
        db,
        user=user,
        association=association,
        action="match.edit",
        entity_type="match",
        entity_id=match.id,
        before=old,
        after=new,
        request=request,
    )

    # The table is derived, never typed, so it is rebuilt from the fixtures
    # rather than adjusted by hand. A status change alone counts too: a result
    # that becomes AWARDED, or a scored match that turns out POSTPONED, moves
    # points without any score being touched.
    if any(key in new for key in _TABLE_FIELDS):
        league = await db.get(League, match.league_id)
        if league is not None:
            await recompute_standings(db, league)

    await db.commit()
    await db.refresh(match)
    return match


@router.patch(
    "/{association_slug}/editor/fields/{field_slug}", response_model=FieldOut
)
async def edit_field(
    association: EditableAssociation,
    user: CurrentUser,
    field_slug: str,
    payload: FieldEdit,
    request: Request,
    db: DbSession,
) -> Field:
    """Fill in a ground.

    This is the only route by which a venue gets coordinates: the federation
    publishes a surface and a floodlight flag and nothing that locates the
    place, so the map link falls back to searching its name until a human puts
    a pin on it.
    """
    venue = (
        await db.execute(
            select(Field).where(
                Field.association_id == association.id, Field.slug == field_slug
            )
        )
    ).scalar_one_or_none()

    if venue is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε γήπεδο '{field_slug}'.",
        )

    tracked = (
        "address",
        "city",
        "postal_code",
        "latitude",
        "longitude",
        "surface",
        "capacity",
        "has_floodlights",
        "notes",
        "name",
        "short_name",
    )
    snapshot = lambda: {  # noqa: E731
        key: (
            value.value
            if isinstance(value := getattr(venue, key), FieldSurface)
            else float(value)
            if key in ("latitude", "longitude") and value is not None
            else value
        )
        for key in tracked
    }

    before = snapshot()
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(venue, key, value)

    # A pin is both numbers or neither: a latitude alone hid the "no pin"
    # warning while the public page still had nowhere to point.
    if (venue.latitude is None) != (venue.longitude is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Χρειάζονται και το γεωγραφικό πλάτος και το μήκος — ή κανένα.",
        )
    if venue.latitude is not None and not (
        _EPIRUS_LAT[0] <= float(venue.latitude) <= _EPIRUS_LAT[1]
        and _EPIRUS_LON[0] <= float(venue.longitude) <= _EPIRUS_LON[1]
    ):
        # 20.8 / 39.7 typed the wrong way round lands in the Horn of Africa.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Το σημείο πέφτει έξω από την Ήπειρο. Έλεγξε ότι το πλάτος (π.χ. 39.66) "
                "και το μήκος (π.χ. 20.85) δεν μπήκαν ανάποδα."
            ),
        )

    old, new = changed_fields(before, snapshot())
    if not old and not new:
        return venue

    record(
        db,
        user=user,
        association=association,
        action="field.edit",
        entity_type="field",
        entity_id=venue.id,
        before=old,
        after=new,
        request=request,
    )
    await db.commit()
    await db.refresh(venue)
    return venue


@router.get(
    "/{association_slug}/editor/audit", response_model=list[AuditEntryOut]
)
async def list_audit(
    association: EditableAssociation,
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[AuditLog]:
    """Recent changes. Visible to every editor of the association, not just
    admins: a shared log is only a deterrent if the people sharing it can
    read it.

    Except the platform's sponsors: their dates and names are contracts, and
    editors do not get that tab at all. The trail of it should not be the way
    round."""
    stmt = select(AuditLog).where(AuditLog.association_id == association.id)
    if user.role is not UserRole.ADMIN:
        stmt = stmt.where(AuditLog.entity_type != "platform_sponsor")
    result = await db.execute(
        stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)
    )
    return list(result.scalars())


@router.get(
    "/{association_slug}/editor/scrape-runs", response_model=list[ScrapeRunOut]
)
async def list_scrape_runs(
    association: EditableAssociation,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[ScrapeRun]:
    """The scraper's recent runs, newest first — the answer to "why is the
    site showing Saturday's scores?" without a shell on the server."""
    result = await db.execute(
        select(ScrapeRun)
        .where(ScrapeRun.association_id == association.id)
        .order_by(ScrapeRun.started_at.desc(), ScrapeRun.id.desc())
        .limit(limit)
    )
    return list(result.scalars())


def _may_hand_out_live(user: User, association: Association) -> None:
    """A club code lets its holder log a live score. Handing one out is
    handing out that right, so only someone who has it may — otherwise an
    editor without live rights could give themselves them through a club."""
    if not may_edit_live(user, association):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Κωδικούς σωματείων εκδίδουν μόνο όσοι έχουν δικαίωμα live καταχώρισης.",
        )


@router.get("/{association_slug}/editor/club-codes", response_model=list[ClubCodeOut])
async def list_club_codes(
    association: EditableAssociation, user: CurrentUser, db: DbSession
) -> list[ClubCodeOut]:
    rows = (
        await db.execute(
            select(ClubAccessCode)
            .where(ClubAccessCode.association_id == association.id)
            .options(selectinload(ClubAccessCode.team))
            .order_by(ClubAccessCode.is_active.desc(), ClubAccessCode.prefix)
        )
    ).scalars()
    return [
        ClubCodeOut(
            id=c.id,
            team_slug=c.team.slug,
            team_name=c.team.name,
            prefix=c.prefix,
            label=c.label,
            is_active=c.is_active,
            last_used_at=c.last_used_at,
            created_at=c.created_at,
        )
        for c in rows
    ]


@router.post(
    "/{association_slug}/editor/club-codes",
    response_model=IssuedCodeOut,
    status_code=status.HTTP_201_CREATED,
)
async def issue_club_code(
    association: EditableAssociation,
    user: CurrentUser,
    payload: IssueCodeIn,
    request: Request,
    db: DbSession,
) -> IssuedCodeOut:
    """Issue a club a fresh code, retiring whatever it had.

    Reissuing is the only recovery: the old one is stored hashed and cannot be
    read back, which is the point. The retired row stays, so the events it
    authored still name who reported them.
    """
    _may_hand_out_live(user, association)
    team = (
        await db.execute(
            select(Team).where(
                Team.association_id == association.id, Team.slug == payload.team_slug
            )
        )
    ).scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε σωματείο '{payload.team_slug}'.",
        )

    code, plaintext = await volunteer_service.issue(
        db,
        association_id=association.id,
        team=team,
        label=(payload.label or "").strip() or None,
        created_by_id=user.id,
    )
    record(
        db,
        user=user,
        association=association,
        action="club_code.issue",
        entity_type="club_access_code",
        entity_id=code.id,
        # The code itself is not in the trail. An audit log that quotes the
        # secret is a second place the secret lives.
        after={"team": team.slug, "prefix": code.prefix, "label": code.label},
        request=request,
    )
    await db.commit()

    return IssuedCodeOut(
        id=code.id,
        team_slug=team.slug,
        team_name=team.name,
        prefix=code.prefix,
        label=code.label,
        is_active=True,
        last_used_at=None,
        created_at=code.created_at,
        code=plaintext,
    )


@router.delete(
    "/{association_slug}/editor/club-codes/{code_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def revoke_club_code(
    association: EditableAssociation,
    user: CurrentUser,
    code_id: int,
    request: Request,
    db: DbSession,
) -> None:
    """Withdraw a code. Takes effect on the next request, not on expiry."""
    _may_hand_out_live(user, association)
    code = (
        await db.execute(
            select(ClubAccessCode).where(
                ClubAccessCode.id == code_id,
                ClubAccessCode.association_id == association.id,
            )
        )
    ).scalar_one_or_none()
    if code is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Δεν βρέθηκε ο κωδικός."
        )

    code.is_active = False
    record(
        db,
        user=user,
        association=association,
        action="club_code.revoke",
        entity_type="club_access_code",
        entity_id=code.id,
        after={"prefix": code.prefix, "is_active": False},
        request=request,
    )
    await db.commit()


@router.post(
    "/{association_slug}/editor/mvp",
    response_model=MvpPollCreatedOut,
    status_code=status.HTTP_201_CREATED,
)
async def open_mvp_poll(
    association: EditableAssociation,
    user: CurrentUser,
    payload: MvpPollIn,
    season: CurrentSeason,
    request: Request,
    db: DbSession,
) -> MvpPollCreatedOut:
    """Open — or replace — the vote for one round of one division.

    Replacing rather than erroring on a second call: a federation that adds a
    player they forgot should not have to find a delete button first. The old
    poll's votes go with it, which is the honest outcome — a ballot with a new
    name on it is a different ballot, and carrying the old counts across would
    be counting votes for a question nobody was asked.
    """
    # Scoped to the season. A division's slug is only unique *within* one —
    # six seasons each have an "a-katigoria" — so an unscoped lookup finds
    # several and fails, which is how this was found.
    league = (
        await db.execute(
            select(League).where(
                League.association_id == association.id,
                League.season_id == season.id,
                League.slug == payload.league_slug,
            )
        )
    ).scalar_one_or_none()
    if league is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκε διοργάνωση '{payload.league_slug}'.",
        )
    if payload.closes_at is not None and payload.closes_at <= datetime.now(UTC):
        # Accepted, it said "the poll opened" over a poll nobody could vote in.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Η ώρα κλεισίματος πρέπει να είναι στο μέλλον.",
        )

    players = {
        p.slug: p
        for p in (
            await db.execute(
                select(Player).where(
                    Player.association_id == association.id,
                    Player.slug.in_([c.player_slug for c in payload.candidates]),
                )
            )
        ).scalars()
    }
    missing = [c.player_slug for c in payload.candidates if c.player_slug not in players]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Δεν βρέθηκαν παίκτες: {', '.join(missing)}.",
        )

    teams = {
        t.slug: t
        for t in (
            await db.execute(
                select(Team).where(
                    Team.association_id == association.id,
                    Team.slug.in_(
                        [c.team_slug for c in payload.candidates if c.team_slug]
                    ),
                )
            )
        ).scalars()
    }

    # A candidate's club must play in this division: a Α΄ Κατηγορία player on
    # a Β΄ ballot was accepted and shown.
    in_league = set(
        (
            await db.execute(select(LeagueTeam.team_id).where(LeagueTeam.league_id == league.id))
        ).scalars()
    )
    outsiders = [
        c.team_slug for c in payload.candidates
        if c.team_slug and (c.team_slug not in teams or teams[c.team_slug].id not in in_league)
    ]
    if outsiders:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Δεν παίζουν σε αυτή την κατηγορία: {', '.join(sorted(set(outsiders)))}.",
        )

    existing = (
        await db.execute(
            select(MvpPoll).where(
                MvpPoll.league_id == league.id, MvpPoll.matchday == payload.matchday
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        await db.flush()

    poll = MvpPoll(
        association_id=association.id,
        league_id=league.id,
        matchday=payload.matchday,
        closes_at=payload.closes_at,
        created_by_id=user.id,
        candidates=[
            MvpCandidate(
                player_id=players[c.player_slug].id,
                team_id=teams[c.team_slug].id if c.team_slug in teams else None,
                reason=(c.reason or "").strip() or None,
            )
            for c in payload.candidates
        ],
    )
    db.add(poll)
    await db.flush()

    record(
        db,
        user=user,
        association=association,
        action="mvp.open",
        entity_type="mvp_poll",
        entity_id=poll.id,
        after={
            "league": league.slug,
            "matchday": payload.matchday,
            "candidates": [c.player_slug for c in payload.candidates],
            "replaced": existing is not None,
        },
        request=request,
    )
    await db.commit()

    return MvpPollCreatedOut(
        id=poll.id,
        league_slug=league.slug,
        matchday=poll.matchday,
        closes_at=poll.closes_at,
        candidates=len(payload.candidates),
    )


async def _mvp_polls(db: DbSession, association_id: int) -> list[MvpPollAdminOut]:
    polls = (
        await db.execute(
            select(MvpPoll)
            .where(MvpPoll.association_id == association_id)
            .options(
                selectinload(MvpPoll.league),
                selectinload(MvpPoll.candidates).selectinload(MvpCandidate.player),
                selectinload(MvpPoll.candidates).selectinload(MvpCandidate.team),
            )
            .order_by(MvpPoll.id.desc())
            .limit(20)
        )
    ).scalars().all()
    counts = {
        cid: n
        for cid, n in (
            await db.execute(
                select(MvpVote.candidate_id, func.count(MvpVote.id))
                .where(MvpVote.poll_id.in_([p.id for p in polls]))
                .group_by(MvpVote.candidate_id)
            )
        ).all()
    } if polls else {}
    now = datetime.now(UTC)
    out = []
    for poll in polls:
        rows = sorted(
            (
                MvpAdminCandidateOut(
                    player_name=c.player.name,
                    team_name=(c.team.short_name or c.team.name) if c.team else None,
                    votes=counts.get(c.id, 0),
                )
                for c in poll.candidates
            ),
            key=lambda r: -r.votes,
        )
        out.append(
            MvpPollAdminOut(
                id=poll.id,
                league_name=poll.league.short_name or poll.league.name,
                matchday=poll.matchday,
                closes_at=poll.closes_at,
                open=poll.closes_at is None or poll.closes_at > now,
                total_votes=sum(r.votes for r in rows),
                candidates=rows,
            )
        )
    return out


@router.get("/{association_slug}/editor/mvp", response_model=list[MvpPollAdminOut])
async def list_mvp_polls(association: EditableAssociation, db: DbSession) -> list[MvpPollAdminOut]:
    """The last twenty polls, newest first, with their counts — so the desk can
    see what is running and announce a winner."""
    return await _mvp_polls(db, association.id)


async def _poll_in(db: DbSession, association_id: int, poll_id: int) -> MvpPoll:
    poll = (
        await db.execute(
            select(MvpPoll).where(MvpPoll.id == poll_id, MvpPoll.association_id == association_id)
        )
    ).scalar_one_or_none()
    if poll is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Δεν βρέθηκε ψηφοφορία.")
    return poll


@router.post("/{association_slug}/editor/mvp/{poll_id}/close", response_model=list[MvpPollAdminOut])
async def close_mvp_poll(
    association: EditableAssociation, user: CurrentUser, poll_id: int, request: Request, db: DbSession
) -> list[MvpPollAdminOut]:
    """Close now, keeping every vote. The only way before was to reopen the poll
    with a past closing time, which threw the votes away."""
    poll = await _poll_in(db, association.id, poll_id)
    poll.closes_at = datetime.now(UTC)
    record(
        db, user=user, association=association, action="mvp.close", entity_type="mvp_poll",
        entity_id=poll.id, after={"matchday": poll.matchday}, request=request,
    )
    await db.commit()
    return await _mvp_polls(db, association.id)


@router.delete("/{association_slug}/editor/mvp/{poll_id}", response_model=list[MvpPollAdminOut])
async def delete_mvp_poll(
    association: EditableAssociation, user: CurrentUser, poll_id: int, request: Request, db: DbSession
) -> list[MvpPollAdminOut]:
    poll = await _poll_in(db, association.id, poll_id)
    record(
        db, user=user, association=association, action="mvp.remove", entity_type="mvp_poll",
        entity_id=poll.id, before={"matchday": poll.matchday}, request=request,
    )
    await db.delete(poll)
    await db.commit()
    return await _mvp_polls(db, association.id)
