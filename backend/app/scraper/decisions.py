"""Deciding what a scrape is allowed to change.

Kept apart from the database work so the rule that matters most — when the
scraper may overrule a human — can be tested with plain objects and a fixed
clock, rather than through a session and a migration.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.models import Match
from app.models.enums import MatchStatus

#: Fields an editor may own. The scraper yields these to a recent manual edit.
CONTESTED = ("home_score", "away_score", "status")

#: Fields the federation is simply authoritative on. An editor typing a live
#: score has no opinion about which pitch the match is on.
UNCONTESTED = ("kickoff_at", "field_id", "referee", "note", "external_id")


class Action(str, enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    UNCHANGED = "unchanged"


@dataclass(slots=True)
class Plan:
    action: Action
    #: Column -> new value, ready to apply.
    changes: dict[str, Any] = field(default_factory=dict)
    #: True when a score change was withheld because a human got there first.
    deferred: bool = False
    #: Populated only when the scraper genuinely disagrees with a stored result,
    #: as opposed to simply not having one yet.
    conflict: dict[str, Any] | None = None


def _scraper_has_something_to_say(
    status: MatchStatus, home_score: int | None, away_score: int | None
) -> bool:
    """Whether the source is actually asserting a result.

    A fixture the federation has not updated yet looks identical to one it has
    nothing to say about, and neither is a reason to erase a score somebody
    entered from the ground.
    """
    if home_score is not None and away_score is not None:
        return True
    # A postponement is a statement even without a score.
    return status in (MatchStatus.POSTPONED, MatchStatus.CANCELLED)


def plan_match(
    existing: Match | None,
    wanted: dict[str, Any],
    now: datetime,
) -> Plan:
    """Work out what to do with one fixture.

    `wanted` holds the scraped values keyed by column name.
    """
    if existing is None:
        return Plan(action=Action.CREATE, changes=dict(wanted))

    changes: dict[str, Any] = {}

    for name in UNCONTESTED:
        if name not in wanted:
            continue
        new = wanted[name]
        # Never blank out something we already know just because this page did
        # not repeat it: a walkover row omits the venue it was once assigned.
        if new is None:
            continue
        if getattr(existing, name) != new:
            changes[name] = new

    asserts_result = _scraper_has_something_to_say(
        wanted.get("status", MatchStatus.SCHEDULED),
        wanted.get("home_score"),
        wanted.get("away_score"),
    )

    deferred = False
    conflict: dict[str, Any] | None = None

    if asserts_result:
        contested = {
            name: wanted[name]
            for name in CONTESTED
            if name in wanted and getattr(existing, name) != wanted[name]
        }
        if contested:
            if existing.scraper_may_overwrite(now):
                changes.update(contested)
                # An official result ends the live state, whatever the editor
                # left behind.
                changes["is_live"] = False
                changes["minute"] = None
            else:
                deferred = True
                # Only a real disagreement is worth an admin's attention. If the
                # stored score has no result yet, the scraper is merely ahead.
                if existing.home_score is not None:
                    conflict = {
                        "scraped": {
                            "home_score": wanted.get("home_score"),
                            "away_score": wanted.get("away_score"),
                            "status": _value(wanted.get("status")),
                        },
                        "current": {
                            "home_score": existing.home_score,
                            "away_score": existing.away_score,
                            "status": _value(existing.status),
                            "data_source": _value(existing.data_source),
                            "last_manual_edit_at": _isoformat(
                                existing.last_manual_edit_at
                            ),
                        },
                    }

    action = Action.UPDATE if changes else Action.UNCHANGED
    return Plan(action=action, changes=changes, deferred=deferred, conflict=conflict)


def _value(v: Any) -> Any:
    return v.value if isinstance(v, enum.Enum) else v


def _isoformat(v: datetime | None) -> str | None:
    return v.isoformat() if v is not None else None
