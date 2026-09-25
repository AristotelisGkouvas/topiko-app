from datetime import date

from app.schemas.catalog import SeasonOut, TeamRef
from app.schemas.common import ORMModel


class PlayerRef(ORMModel):
    """A player as they appear inside a leaderboard row or a suspension."""

    id: int
    slug: str
    name: str
    birth_year: int | None = None


class ScorerOut(ORMModel):
    """One row of the σκόρερ table.

    Every count is nullable because the source publishes the head of each list
    and not the same columns for each competition: a division may show goals
    and nothing else. A zero would claim the player has no cards; null says the
    federation did not publish that column, which is a different thing and the
    only honest one to render as a dash.
    """

    player: PlayerRef
    team: TeamRef | None = None
    goals: int | None = None
    own_goals: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None
    minutes: int | None = None


class RosterRowOut(ORMModel):
    """One player on a club's public roster.

    "Roster" is everybody who has appeared for the club this season — the
    federation publishes appearances, not registrations.
    """

    player: PlayerRef
    goals: int = 0
    yellow_cards: int | None = None
    red_cards: int | None = None
    #: The latest ban this season, when it may still be running: counted from
    #: the round it followed against the division's current round. A guide,
    #: not a ruling — the federation's own list is the authority.
    banned_matches: int | None = None
    banned_after_matchday: int | None = None


class LiveScorerOut(ORMModel):
    """A scorer counted from the goals logged at the ground.

    Unofficial and kept apart from ScorerOut: these are what volunteers and
    the desk typed during matches, named from the roster. The federation's own
    table is the record; this one is what happened last Sunday before the
    federation has published it.
    """

    player: PlayerRef
    team: TeamRef | None = None
    goals: int


class PlayerSearchOut(PlayerRef):
    """A search hit.

    Carries a club and a goal count because the name alone does not identify
    anybody: the register holds three men called ΘΑΝΑΣΗΣ ΚΩΝΣΤΑΝΤΙΝΟΣ, and a
    list of three identical rows asks the reader to guess. The most recent club
    is what a person actually recognises.
    """

    last_team: TeamRef | None = None
    total_goals: int = 0


class PlayerSeasonOut(ORMModel):
    """One player's line in one competition, with the season around it.

    A career is read down this list, so the competition and season come along
    rather than being ids the client has to resolve — fifteen rows would
    otherwise mean fifteen lookups.
    """

    season: SeasonOut
    league_slug: str
    league_name: str
    team: TeamRef | None = None
    goals: int | None = None
    own_goals: int | None = None
    yellow_cards: int | None = None
    red_cards: int | None = None


class PlayerDetailOut(ORMModel):
    """A footballer's page.

    `total_goals` is summed over published leaderboard lines, not over match
    events, because the source never gives the second. It is therefore a floor
    and not a count: a season where the federation published no list at all
    contributes nothing, and the page says so rather than implying the player
    did not play.
    """

    id: int
    slug: str
    name: str
    birth_year: int | None = None
    #: Newest first.
    seasons: list[PlayerSeasonOut] = []
    total_goals: int = 0
    seasons_scored: int = 0
    #: The clubs they appear for, newest first.
    clubs: list[TeamRef] = []
    #: Goals logged at the ground by volunteers and the desk, with this
    #: player named. Unofficial and never added to `total_goals`: it is what
    #: the page can say on Sunday evening, before the federation publishes.
    live_goals: int = 0


class SuspensionOut(ORMModel):
    """One disciplinary ban, as the federation published it.

    `team` can be absent and `fixture` is free text, because the source prints
    a pairing rather than a club, and only links a game id when the match has a
    report. A ban whose fixture could not be placed is still a ban, and hiding
    it would understate who is unavailable.
    """

    id: int
    player: PlayerRef
    team: TeamRef | None = None
    league_slug: str
    league_name: str
    matchday: int | None = None
    decided_on: date | None = None
    #: How many matches the ban runs for.
    matches: int
    fixture: str | None = None
    match_id: int | None = None
