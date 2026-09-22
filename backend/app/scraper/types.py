"""What a source hands back.

Deliberately dumb dataclasses, not ORM objects: a parser must be testable
against a saved HTML file with no database anywhere near it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time

from app.models.enums import MatchStatus


@dataclass(frozen=True, slots=True)
class ScrapedLeague:
    """A competition as the source lists it."""

    external_id: str
    name: str
    # The source's own grouping heading, e.g. "Α Κατηγορία", "Κ 16".
    category: str | None = None


@dataclass(frozen=True, slots=True)
class ScrapedMatch:
    matchday: int
    home_team: str
    away_team: str
    venue: str | None = None
    kickoff_date: date | None = None
    kickoff_time: time | None = None
    home_score: int | None = None
    away_score: int | None = None
    status: MatchStatus = MatchStatus.SCHEDULED
    referee: str | None = None

    #: The source's own id for this fixture, when it publishes one. Enrichment
    #: only — epsip.gr omits it for roughly a quarter of rows, so nothing may be
    #: keyed on it.
    external_id: str | None = None
    #: The source's own id for the venue, which is far more reliable than the
    #: venue's printed name.
    venue_external_id: str | None = None
    #: Whatever the result cell said when it was not a score, e.g. a
    #: postponement note. Preserved verbatim for the match card.
    note: str | None = None

    @property
    def is_played(self) -> bool:
        return self.home_score is not None and self.away_score is not None

    @property
    def key(self) -> tuple[int, str, str]:
        """Identity within a league. The source gives matches no id of their
        own, so the fixture itself is the key."""
        return (self.matchday, self.home_team, self.away_team)


@dataclass(frozen=True, slots=True)
class ScrapedStanding:
    position: int
    team: str
    points: int
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int

    @property
    def implied_points(self) -> int:
        """Points the results alone would give, at 3/1/0.

        Compared against `points` this is how a deduction shows up: ΕΠΣ sites
        publish the final number without ever saying a penalty was applied.
        """
        return self.won * 3 + self.drawn


@dataclass(slots=True)
class ScrapeResult:
    """One league's worth of scraped data, plus whatever went wrong."""

    league: ScrapedLeague
    matches: list[ScrapedMatch] = field(default_factory=list)
    standings: list[ScrapedStanding] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def warn(self, message: str) -> None:
        self.warnings.append(message)


@dataclass(frozen=True, slots=True)
class ScrapedPlayer:
    """One row of the federation's player register."""

    external_id: str
    name: str
    birth_year: int | None = None


@dataclass(frozen=True, slots=True)
class ScrapedPlayerStat:
    """A player's line in one competition's published leaderboards.

    Every count is optional and None means *unknown*, not zero: the source
    publishes only the top of each list — ten scorers, twenty for minutes — so
    a player absent from the yellow-card table may have none or may simply have
    fewer than the tenth-placed player.
    """

    player_external_id: str
    player_name: str
    team_external_id: str | None = None
    team_name: str | None = None
    goals: int | None = None
    own_goals: int | None = None
    red_cards: int | None = None
    yellow_cards: int | None = None
    minutes: int | None = None


@dataclass(frozen=True, slots=True)
class ScrapedSuspension:
    """One disciplinary ban, as the federation lists it."""

    player_external_id: str
    player_name: str
    matches: int
    matchday: int | None = None
    decided_on: date | None = None
    fixture: str | None = None
    #: The game_id the row links to, when the federation printed one.
    match_external_id: str | None = None


@dataclass(slots=True)
class ScrapedField:
    """A venue as the federation's own register describes it.

    Everything past the name is optional because the register is mostly empty:
    of 114 grounds here, all carry a surface and a floodlight flag, thirteen
    carry a location and three carry dimensions.
    """

    external_id: str
    name: str
    #: Free text — a village ("ΝΕΟΚΑΙΣΑΡΕΙΑ") or a landmark ("ΕΝΑΝΤΙ ΠΥΛΗΣ
    #: ΠΑΝΕΠΙΣΤΗΜΙΟΥ"). Not a postal address and not a town on its own, so it
    #: goes to `address` rather than `city`.
    location: str | None = None
    surface: str | None = None
    has_floodlights: bool | None = None
    capacity: int | None = None
