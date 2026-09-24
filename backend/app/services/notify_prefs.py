"""Which notifications a browser has asked for, and when it will accept them.

Two questions, kept apart because they fail differently. "Do you want goals for
this club" is a per-club choice the reader made on purpose; "it is half past
one in the morning" is a property of the phone, true for every club at once.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.enums import MatchEventKind

#: The switches screen N1 offers, and what each one covers.
#:
#: Grouped rather than one per event kind: nobody wants "second yellow" on and
#: "red" off, and a screen with thirteen switches is a screen nobody finishes.
GROUPS: dict[str, tuple[MatchEventKind, ...]] = {
    "goal": (
        MatchEventKind.GOAL,
        MatchEventKind.PENALTY_GOAL,
        MatchEventKind.OWN_GOAL,
    ),
    "status": (
        MatchEventKind.KICKOFF,
        MatchEventKind.HALFTIME,
        MatchEventKind.SECOND_HALF,
        MatchEventKind.FULLTIME,
    ),
    "penalty": (MatchEventKind.PENALTY_MISS,),
    "cards": (
        MatchEventKind.YELLOW,
        MatchEventKind.SECOND_YELLOW,
        MatchEventKind.RED,
    ),
    "postponed": (MatchEventKind.POSTPONED, MatchEventKind.ABANDONED),
}

#: What a browser gets when it has said nothing. Goals and the final whistle
#: are why somebody turns notifications on; cards are why they turn them off.
DEFAULTS: dict[str, bool] = {
    "goal": True,
    "status": True,
    "penalty": True,
    "cards": False,
    # On by default, and the one switch nobody should have to find: an
    # abandoned match is what somebody needs told *before* they drive to it.
    "postponed": True,
}

_GROUP_OF: dict[MatchEventKind, str] = {
    kind: group for group, kinds in GROUPS.items() for kind in kinds
}


def group_for(kind: MatchEventKind) -> str | None:
    """Which switch governs this event, or None if no switch does.

    A kind nobody has a switch for — a free-text note — is never pushed. The
    alternative is a notification a reader cannot turn off.
    """
    return _GROUP_OF.get(kind)


def wants(prefs: dict, kind: MatchEventKind) -> bool:
    """Whether this subscription asked for this event."""
    group = group_for(kind)
    if group is None:
        return False
    value = prefs.get(group)
    return DEFAULTS[group] if value is None else bool(value)


def is_quiet(
    *,
    quiet_from: int | None,
    quiet_to: int | None,
    utc_offset: int,
    now: datetime | None = None,
) -> bool:
    """Whether the reader's local clock is inside their quiet hours.

    The window normally wraps midnight — 23:00 to 08:00 — so a plain
    `from <= hour < to` is wrong for the common case rather than the rare one.

    A window where both ends are the same hour is treated as no window at all.
    "Quiet from 8 to 8" is either a mistake or a request for permanent silence,
    and permanent silence is what turning notifications off is for.
    """
    if quiet_from is None or quiet_to is None or quiet_from == quiet_to:
        return False

    moment = (now or datetime.now(UTC)) + timedelta(minutes=utc_offset)
    hour = moment.hour

    if quiet_from < quiet_to:
        return quiet_from <= hour < quiet_to
    return hour >= quiet_from or hour < quiet_to
