"""iCalendar output for a club's fixtures.

Hand-built rather than pulled from a library, because the subset in play here
is small and the library would be a dependency carried for six field names.
The parts that are easy to get wrong are done explicitly and commented: this
is a format where a mistake does not raise, it just makes one calendar app
show nothing while another looks fine.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime

from app.models import Match, Team
from app.models.enums import MatchStatus

#: RFC 5545 §3.1: content lines end CRLF, not LF. Some clients tolerate LF;
#: iOS is not reliably one of them.
CRLF = "\r\n"

#: RFC 5545 §3.1 again: lines are folded at 75 octets, and the continuation
#: starts with a single space. Greek club names are multi-byte, so the count
#: has to be over encoded bytes — folding on characters overruns the limit and
#: can split a UTF-8 sequence in half.
FOLD_AT = 74

_STATUSES = {
    MatchStatus.CANCELLED: "CANCELLED",
    MatchStatus.POSTPONED: "TENTATIVE",
}


def _escape(value: str) -> str:
    """Escape TEXT per §3.3.11. Order matters: backslash first, or the escapes
    this adds would themselves be escaped."""
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    encoded = line.encode("utf-8")
    if len(encoded) <= FOLD_AT:
        return line

    pieces: list[str] = []
    while encoded:
        head, encoded = encoded[:FOLD_AT], encoded[FOLD_AT:]
        # Do not cut a character in half: back off to a boundary and give the
        # bytes to the next line.
        while head and encoded and (encoded[0] & 0xC0) == 0x80:
            encoded = head[-1:] + encoded
            head = head[:-1]
        pieces.append(head.decode("utf-8"))
    return CRLF.join([pieces[0]] + [f" {p}" for p in pieces[1:]])


def _stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def build_calendar(
    team: Team,
    matches: Iterable[Match],
    *,
    association_slug: str,
    site_url: str | None = None,
    now: datetime | None = None,
) -> str:
    now = now or datetime.now(UTC)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//Pame Sentra//{association_slug}//EL",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(team.name)}",
        "X-WR-TIMEZONE:Europe/Athens",
        # Both spellings: the standard one and the Apple one that predates it.
        # A subscribed calendar that never re-polls is a calendar that shows
        # last month's fixtures for the rest of the season.
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ]

    for match in matches:
        if match.kickoff_at is None:
            # No date, nothing to put in a calendar. A fixture list can say
            # "to be arranged"; a calendar cannot.
            continue

        home = match.home_team.name
        away = match.away_team.name
        summary = f"{home} - {away}"
        venue = match.field.name if match.field else None

        described = [f"{summary}"]
        if match.matchday:
            described.append(f"{match.matchday}η αγωνιστική")
        if match.home_score is not None and match.away_score is not None:
            described.append(f"Τελικό: {match.home_score}-{match.away_score}")

        lines += [
            "BEGIN:VEVENT",
            # Stable across regenerations, so an edited fixture updates in
            # place instead of appearing twice.
            f"UID:match-{match.id}@pamesentra",
            f"DTSTAMP:{_stamp(now)}",
            f"DTSTART:{_stamp(match.kickoff_at)}",
            # Amateur football has no published end time. Ninety minutes plus
            # half time is closer than leaving it open-ended, which some
            # clients render as an all-day event.
            "DURATION:PT105M",
            f"SUMMARY:{_escape(summary)}",
            f"DESCRIPTION:{_escape(' · '.join(described))}",
        ]
        if venue:
            lines.append(f"LOCATION:{_escape(venue)}")
        if site_url:
            lines.append(f"URL:{site_url.rstrip('/')}/agones/{match.id}")
        if (status := _STATUSES.get(match.status)) is not None:
            lines.append(f"STATUS:{status}")
        else:
            lines.append("STATUS:CONFIRMED")

        # Bumped whenever the row changes, which is how a calendar client is
        # told to replace what it already has rather than keep the old time.
        if match.updated_at:
            lines.append(f"SEQUENCE:{int(match.updated_at.timestamp())}")

        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return CRLF.join(_fold(line) for line in lines) + CRLF
