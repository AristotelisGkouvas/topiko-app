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
