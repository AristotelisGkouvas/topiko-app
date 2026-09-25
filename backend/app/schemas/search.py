from typing import Literal

from pydantic import BaseModel


class SearchHitOut(BaseModel):
    """One result, in the shape the list row needs and no larger.

    Deliberately flat and identical across categories: the "Όλα" tab mixes
    clubs, players and grounds in one list, and a row that has to branch on
    which of three objects it received is a row that renders three ways.
    """

    kind: Literal["team", "player", "field", "match"]
    slug: str
    name: str
    #: The line under the name — city for a club or ground, last club for a
    #: player. Null when we genuinely do not know, never a filler string.
    subtitle: str | None = None
    logo_url: str | None = None


class SearchOut(BaseModel):
    #: Echoed back so a late response can be discarded by a client that has
    #: since typed more.
    query: str
    teams: list[SearchHitOut] = []
    players: list[SearchHitOut] = []
    fields: list[SearchHitOut] = []
    #: Matches whose referee matches the query. Referees have no page of
    #: their own; what a reporter wants is which games they took.
    matches: list[SearchHitOut] = []
