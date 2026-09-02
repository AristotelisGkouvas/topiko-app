"""The contract every source adapter implements.

Deliberately *not* a config-driven generic engine. A survey of five ΕΠΣ sites
found four unrelated shapes — bespoke PHP, a shared classic-ASP template,
WordPress/Elementor, and one federation that publishes results only as PDFs.
No amount of selector configuration bridges those, so parsing is code, one
adapter per family, and `associations.scraper_config` only says which adapter
to use and with what parameters.

What *is* shared lives outside this interface: fetching, team and venue
resolution, the reconciliation write path, and run logging. That is the larger
half of the work, and it is written once.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.scraper.types import (
    ScrapedLeague,
    ScrapedMatch,
    ScrapedPlayer,
    ScrapedPlayerStat,
    ScrapedStanding,
    ScrapedSuspension,
)


@runtime_checkable
class Source(Protocol):
    """Pure parsing. No HTTP, no database.

    Every method takes markup that somebody else fetched and returns plain
    dataclasses, which is what makes a source testable against a saved page.
    """

    #: Key used in `associations.scraper_config["source"]`.
    key: str

    def league_index_path(self, period_id: str | None = None) -> str:
        """Path of the page listing this season's competitions."""
        ...

    def parse_league_index(self, html: str) -> list[ScrapedLeague]:
        ...

    def schedule_path(self, league_external_id: str) -> str:
        """Path of the page carrying fixtures *and* results for one league."""
        ...

    def parse_schedule(self, html: str) -> list[ScrapedMatch]:
        ...

    def standings_path(self, league_external_id: str) -> str:
        ...

    def parse_standings(self, html: str) -> list[ScrapedStanding]:
        ...


@runtime_checkable
class CatalogSource(Protocol):
    """A source that publishes its clubs and venues with stable ids.

    Separate from `Source` because it is genuinely optional: a federation that
    only puts results on the page gives you nothing to key clubs on, and its
    adapter should not have to pretend otherwise. Where it *is* available it is
    the difference between resolving clubs by id and guessing at spellings.
    """

    def teams_path(self) -> str: ...

    def parse_teams(self, html: str) -> dict[str, str]:
        """external team id -> club name."""
        ...

    def fields_path(self) -> str: ...

    def parse_fields(self, html: str) -> dict[str, str]:
        """external venue id -> venue name."""
        ...


@runtime_checkable
class PeopleSource(Protocol):
    """A source that also publishes players, leaderboards and bans.

    Optional for the same reason CatalogSource is: plenty of federations put up
    results and nothing else. Where it exists, every row carries the source's
    own player_id and team_id, so none of it depends on matching names.
    """

    def players_path(self, page: int = 1) -> str: ...

    def parse_player_pages(self, html: str) -> int:
        """How many pages the register runs to."""
        ...

    def parse_players(self, html: str) -> list[ScrapedPlayer]: ...

    def stats_path(self, league_external_id: str) -> str: ...

    def parse_stats(self, html: str) -> list[ScrapedPlayerStat]: ...

    def forfeits_path(self, league_external_id: str) -> str: ...

    def parse_forfeits(self, html: str) -> list[ScrapedSuspension]: ...
