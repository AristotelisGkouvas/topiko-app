"""Whether a match is actually being played right now.

`matches.is_live` is what the source last said, and nothing expires it. The
scraper sets it on a pass and clears it on a later pass — so a flag set during a
Sunday afternoon survives until the next scrape, and a flag the source sets
wrongly survives indefinitely. The site audit found fixture 52303, kicking off
on 24 October, labelled ΗΜΙΧΡΟΝΟ on 23 September.

So the stored column keeps its meaning — "the source claims this is live" — and
the API answers a different, checkable question: is the clock consistent with
that claim? A match cannot be at half time before it kicks off.

Applied at the edge rather than in the scraper because the scraper is not the
only thing that can be wrong, and because a rule enforced where the value is
read holds for every reader without a backfill.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.enums import MatchStatus

# --- Windows around kickoff -------------------------------------------------
#
# Every "is this match happening around now?" rule in the app, in one place so
# they can be read side by side. They differ on purpose — each answers a
# different question — but they should differ because somebody decided to,
# not because two files drifted.
#
#   reader sees LIVE         kickoff .............. +LIVE_WINDOW
#   editor needs can_edit    kickoff -LIVE_LEAD ... +LIVE_WINDOW
#   club code may report     kickoff -REPORT_FROM . +REPORT_UNTIL
#   scraper polls fast       settings.scraper_lead_minutes /
#                            settings.scraper_match_window_hours (env-tunable,
#                            defaults equal to LIVE_LEAD / LIVE_WINDOW)

#: How long after kickoff a live claim is still believable. Ninety minutes plus
#: half time plus stoppages plus the delay before somebody records the final
#: whistle. Generous on purpose: cutting a genuine live match off at 105
#: minutes would be a worse failure than carrying a stale one for an extra hour.
LIVE_WINDOW = timedelta(hours=3)

#: How far before kickoff an edit already counts as live. The minutes before
#: kickoff are when a postponement gets typed in.
LIVE_LEAD = timedelta(minutes=30)

#: How long before kickoff a club representative may start reporting, and how
#: long after it they may still be doing so. Wider than LIVE_WINDOW because a
#: late kickoff and a sheet finished in the car park are both ordinary. Outside
#: it they are looking at history, and a live log written over a finished match
#: replaces the official score with whatever the log happens to contain.
REPORT_FROM = timedelta(hours=3)
REPORT_UNTIL = timedelta(hours=6)

#: Statuses that are a live claim rather than an outcome.
LIVE_STATUSES = (MatchStatus.LIVE, MatchStatus.HALFTIME)


def live_window(kickoff_at: datetime | None, now: datetime | None = None) -> bool:
    """Whether the clock allows a live claim at all.

    False for a match with no kickoff time: we cannot check the claim, and an
    unverifiable "live" is the thing this exists to stop.
    """
    if kickoff_at is None:
        return False
    moment = now or datetime.now(UTC)
    return kickoff_at <= moment < kickoff_at + LIVE_WINDOW


def effective(
    *,
    status: MatchStatus,
    is_live: bool,
    kickoff_at: datetime | None,
    home_score: int | None,
    away_score: int | None,
    now: datetime | None = None,
) -> tuple[MatchStatus, bool]:
    """The status and live flag to show, given the clock.

    Outside the window a live claim is dropped. What it becomes depends on what
    else we know:

    - A score for both sides means it was played, so FINISHED.
    - No score means we do not know the outcome — and an unscored fixture is
      already shown as SCHEDULED everywhere else on the site, because whole
      youth divisions are never scored at all. So SCHEDULED, which is also the
      right answer for the actual bug: a fixture three weeks away.

    A status that is already an outcome — finished, postponed, cancelled,
    awarded — is never touched. Only the live claim is in question here.
    """
    if status not in LIVE_STATUSES and not is_live:
        return status, False

    if live_window(kickoff_at, now):
        return status, True

    if status in LIVE_STATUSES:
        played = home_score is not None and away_score is not None
        return (MatchStatus.FINISHED if played else MatchStatus.SCHEDULED), False

    # The flag was set on a match whose status is already an outcome. Drop the
    # flag, keep the outcome.
    return status, False
