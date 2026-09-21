from app.schemas.catalog import TeamRef
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
