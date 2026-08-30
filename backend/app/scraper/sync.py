"""Writing a scrape into the database.

The order of business matters: clubs and venues first, so that fixtures have
something to point at; then fixtures, under the reconciliation rule; then the
table, which is recomputed from our own fixtures rather than copied, and only
compared against the published one.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Association,
    Field,
    League,
    LeagueTeam,
    Match,
    ScrapeConflict,
    ScrapeRun,
    Season,
    Standing,
    Team,
    TeamAlias,
)
from app.models.enums import (
    ConflictStatus,
    DataSource,
    LeagueKind,
    ScrapeRunStatus,
)
from app.scraper import naming
from app.scraper.decisions import Action, plan_match
from app.scraper.http import Fetcher
from app.scraper.sources.base import CatalogSource, Source
from app.scraper.types import ScrapedMatch
from app.services.standings import recompute_standings

logger = logging.getLogger(__name__)

# Kickoff times are published as Greek wall-clock. Stored as UTC, which is what
# the API and the frontend both expect.
ATHENS_UTC_OFFSET_HOURS = 2

# The source groups competitions under headings; these are the ones that map to
# a numbered tier. Anything else (Κ16, Κύπελλο) keeps tier = None.
TIER_BY_CATEGORY = {
    "Α ΚΑΤΗΓΟΡΙΑ": 1,
    "Β ΚΑΤΗΓΟΡΙΑ": 2,
    "Γ ΚΑΤΗΓΟΡΙΑ": 3,
    "Δ ΚΑΤΗΓΟΡΙΑ": 4,
}


@dataclass(slots=True)
class Stats:
    matches_created: int = 0
    matches_updated: int = 0
    matches_unchanged: int = 0
    matches_deferred: int = 0
    teams_created: int = 0
    conflicts_opened: int = 0
    #: Something the run could not do. Any of these downgrades it to PARTIAL.
    warnings: list[str] = field(default_factory=list)
    #: Something worth telling a human that is nevertheless a success. Kept
    #: apart so that a run which discovered a points deduction — exactly what
    #: it is supposed to do — is not filed next to one that failed halfway.
    notes: list[str] = field(default_factory=list)

    def warn(self, message: str) -> None:
        # Repeats add noise without adding information — the same unresolvable
        # club shows up on every one of its fixtures, so it is logged once too.
        if message not in self.warnings:
            self.warnings.append(message)
            logger.warning(message)

    def note(self, message: str) -> None:
        if message not in self.notes:
            self.notes.append(message)
            logger.info(message)


def _to_utc(day: Any, clock: time | None) -> datetime | None:
    """Combine a published date and wall-clock time into a UTC instant."""
    if day is None:
        return None
    naive = datetime.combine(day, clock or time(0, 0))
    # Fixed offset rather than a tz database lookup: these are future fixtures
    # whose real offset depends on a DST boundary the federation itself does not
    # account for when it publishes "17:00".
    return naive.replace(tzinfo=timezone.utc) - timedelta(
        hours=ATHENS_UTC_OFFSET_HOURS
    )


class Resolver:
    """Maps the names a source prints onto rows in this association.

    Identity comes from the source's own ids where they exist. Names are only
    the bridge between the fixture list, which prints names, and the club list,
    which carries ids.
    """

    def __init__(self, db: AsyncSession, association: Association, stats: Stats):
        self.db = db
        self.association = association
        self.stats = stats
        self._teams_by_key: dict[str, Team] = {}
        self._teams: list[Team] = []
        self._taken_team_slugs: set[str] = set()
        self._fields_by_external: dict[str, Field] = {}
        self._fields_by_key: dict[str, Field] = {}
        self._fields: list[Field] = []
        self._taken_field_slugs: set[str] = set()

    async def load_teams(self, catalog: dict[str, str], source_key: str) -> None:
        """Reconcile the association's clubs against the source's club list."""
        existing = list(
            (
                await self.db.execute(
                    select(Team).where(Team.association_id == self.association.id)
                )
            ).scalars()
        )
        by_external = {t.external_id: t for t in existing if t.external_id}
        taken = {t.slug for t in existing}
        self._teams = existing
        self._taken_team_slugs = taken

        for external_id, name in catalog.items():
            if naming.is_corrupt(name):
                self.stats.warn(f"Κατεστραμμένο όνομα ομάδας στην πηγή: {name!r}")
                continue
            team = by_external.get(external_id)
            if team is None:
                # Fall back to the name before creating: a club seeded by hand
                # should acquire the id, not a duplicate row.
                match = naming.find(name, naming.index({t.name: t for t in existing}))
                if match is not None and match.exact and match.value.external_id is None:
                    team = match.value
                    team.external_id = external_id
                else:
                    slug = naming.unique_slug(naming.slugify(name), taken)
                    taken.add(slug)
                    team = Team(
                        association_id=self.association.id,
                        slug=slug,
                        name=name,
                        initials=_initials(name),
                        external_id=external_id,
                    )
                    self.db.add(team)
                    existing.append(team)
                    self.stats.teams_created += 1
            elif team.name != name:
                # The federation renamed a club; the id says it is the same one.
                team.name = name
            by_external[external_id] = team

        await self.db.flush()

        self._teams_by_key = naming.index({t.name: t for t in existing})
        # Aliases override, since a human added them precisely because the
        # automatic reading was wrong.
        for alias in (
            await self.db.execute(
                select(TeamAlias).where(
                    TeamAlias.association_id == self.association.id
                )
            )
        ).scalars():
            team = next((t for t in existing if t.id == alias.team_id), None)
            if team is not None:
                self._teams_by_key[alias.normalized] = team

    async def load_fields(self, catalog: dict[str, str]) -> None:
        existing = list(
            (
                await self.db.execute(
                    select(Field).where(Field.association_id == self.association.id)
                )
            ).scalars()
        )
        by_external = {f.external_id: f for f in existing if f.external_id}
        taken = {f.slug for f in existing}
        self._fields = existing
        self._taken_field_slugs = taken

        for external_id, name in catalog.items():
            if naming.is_corrupt(name):
                continue
            venue = by_external.get(external_id)
            if venue is None:
                match = naming.find(name, naming.index({f.name: f for f in existing}))
                if match is not None and match.exact and match.value.external_id is None:
                    venue = match.value
                    venue.external_id = external_id
                else:
                    slug = naming.unique_slug(naming.slugify(name), taken)
                    taken.add(slug)
                    venue = Field(
                        association_id=self.association.id,
                        slug=slug,
                        name=name,
                        external_id=external_id,
                    )
                    self.db.add(venue)
                    existing.append(venue)
                by_external[external_id] = venue

        await self.db.flush()
        self._fields_by_external = by_external
        self._fields_by_key = naming.index({f.name: f for f in existing})

    async def team(self, name: str) -> Team | None:
        """The club this name refers to, creating it if it is genuinely new.

        The source's club list holds only *currently registered* clubs, so a
        fixture from an earlier season routinely names a club that has since
        folded or merged. Refusing those would drop every match they played —
        in 2014-15 that is half the division.

        The near-miss check is what makes creating safe: a club that has
        vanished from the register has no lookalike in it, whereas a misspelling
        does. So an unrecognised name with no close twin is a real club, and one
        with a twin is a question for a human — unless the two differ by a squad
        letter, which is a real distinction that similarity scoring hides.
        """
        found = naming.find(name, self._teams_by_key)
        if found is not None and found.exact:
            return found.value
        if found is not None and naming.same_club(name, found.value.name):
            # Word order or a dropped club-type prefix. Remember it, so the rest
            # of this run resolves the spelling without re-deriving it.
            self._teams_by_key[naming.normalize(name)] = found.value
            return found.value
        if found is not None and naming.same_squad(name, found.value.name):
            # A near miss is a suggestion for a human, never an action: acting
            # on it is how results end up on the wrong club.
            self.stats.warn(
                f"Αβέβαιη αντιστοίχιση ομάδας {name!r} → {found.value.name!r} "
                f"({found.score:.0%}). Πρόσθεσε alias για να λυθεί."
            )
            return None
        if naming.is_corrupt(name):
            self.stats.warn(f"Κατεστραμμένο όνομα ομάδας στην πηγή: {name!r}")
            return None

        slug = naming.unique_slug(naming.slugify(name), self._taken_team_slugs)
        self._taken_team_slugs.add(slug)
        # No external_id: this club is not in the register. If it ever returns,
        # load_teams adopts this row by exact name and fills the id in.
        team = Team(
            association_id=self.association.id,
            slug=slug,
            name=name,
            initials=_initials(name),
        )
        self.db.add(team)
        await self.db.flush()
        self._teams.append(team)
        self._teams_by_key[naming.normalize(name)] = team
        self.stats.teams_created += 1
        self.stats.note(f"Άγνωστο στο μητρώο, καταγράφηκε: {name!r}")
        return team

    async def field(self, external_id: str | None, name: str | None) -> Field | None:
        """The venue, created if the map does not list it.

        fields_map.php shows the pitches in use now. Grounds that have closed
        still appear in old fixture lists, and losing them would leave a decade
        of matches with no venue at all.
        """
        if external_id and (venue := self._fields_by_external.get(external_id)):
            return venue
        if not name or naming.is_corrupt(name):
            return None

        found = naming.find(name, self._fields_by_key)
        if found is not None and found.exact:
            venue = found.value
            # An old fixture can be the first place a ground's id is printed.
            if external_id and venue.external_id is None:
                venue.external_id = external_id
                self._fields_by_external[external_id] = venue
            return venue
        if found is not None:
            # Unlike a club, an unmatched venue costs one line of a match card,
            # not the match, so a near miss is noted rather than warned about.
            self.stats.note(
                f"Αβέβαιο γήπεδο {name!r} → {found.value.name!r} ({found.score:.0%})."
            )
            return None

        slug = naming.unique_slug(naming.slugify(name), self._taken_field_slugs)
        self._taken_field_slugs.add(slug)
        venue = Field(
            association_id=self.association.id,
            slug=slug,
            name=name,
            external_id=external_id,
        )
        self.db.add(venue)
        await self.db.flush()
        self._fields.append(venue)
        self._fields_by_key[naming.normalize(name)] = venue
        if external_id:
            self._fields_by_external[external_id] = venue
        return venue


#: Splits on dots as well as spaces. "Α.Ε.Δ.ΠΩΓΩΝΑΤΟΣ" carries no space at
#: all, so splitting on whitespace alone hands back the whole string and every
#: club in the league ends up monogrammed "ΑΕ".
_WORDS = re.compile(r"[.\s]+")


def _initials(name: str) -> str:
    """Two-letter monogram for the crest, from the most identifying word.

    Club names lead with abbreviations ("Α.Ο.", "Π.Α.Σ.", "Α.Ε.Δ.") shared by
    half the league and often trail a founding year, so what actually tells two
    clubs apart is the last real word — usually the village.
    """
    words = [
        w
        for w in _WORDS.split(naming.strip_accents(name).upper())
        # Three letters or more skips the "Α", "Ο", "Σ" left by the abbreviations;
        # requiring a letter skips a founding year such as "2004".
        if len(w) >= 3 and any(c.isalpha() for c in w)
    ]
    word = words[-1] if words else name.replace(".", "").strip()
    return word[:2] or "??"


class Syncer:
    def __init__(
        self,
        db: AsyncSession,
        association: Association,
        source: Source,
        fetcher: Fetcher,
    ):
        self.db = db
        self.association = association
        self.source = source
        self.fetcher = fetcher
        self.stats = Stats()
        self.resolver = Resolver(db, association, self.stats)

    async def sync(
        self,
        league_slugs: list[str] | None = None,
        dry_run: bool = False,
        seasons: list[str] | None = None,
        all_seasons: bool = False,
    ) -> ScrapeRun:
        """Bring this association up to date.

        By default only the configured season is touched, because that is what
        a scheduled run needs. `seasons` names particular ones and
        `all_seasons` takes the lot — both are for backfilling, which is a
        thing you do once.
        """
        config = self.association.scraper_config or {}
        run = ScrapeRun(
            association_id=self.association.id,
            source_key=getattr(self.source, "key", "unknown"),
            started_at=datetime.now(timezone.utc),
            status=ScrapeRunStatus.RUNNING,
        )
        self.db.add(run)
        await self.db.flush()

        try:
            index_html = await self.fetcher.get(
                self.source.league_index_path(config.get("period_id"))
            )
            periods = self._read_periods(index_html)
            targets = self._choose_periods(periods, config, seasons, all_seasons)

            # The club and venue registers are not season-scoped, so they are
            # read once however many seasons follow.
            await self._load_catalog()

            for slug, period_id, is_current in targets:
                html = (
                    index_html
                    if period_id == str(config.get("period_id") or "")
                    or period_id is None
                    else await self.fetcher.get(
                        self.source.league_index_path(period_id)
                    )
                )
                await self._sync_season(
                    slug,
                    is_current,
                    html,
                    config,
                    league_slugs,
                    # league_ids narrows the routine run to the divisions the
                    # site shows. Asking for seasons by name or for all of them
                    # is asking for what the federation published, so the
                    # narrowing does not apply.
                    use_league_filter=not (all_seasons or bool(seasons)),
                )
                if not dry_run and len(targets) > 1:
                    # A backfill is half an hour of requests. Committing each
                    # season as it lands means an interruption costs the season
                    # in progress rather than all twelve. A single-season run
                    # keeps its one commit at the end, where the whole update
                    # is atomic.
                    await self.db.commit()

            run.status = (
                ScrapeRunStatus.PARTIAL if self.stats.warnings else ScrapeRunStatus.SUCCESS
            )
        except Exception as exc:  # noqa: BLE001 - recorded, then re-raised
            run.status = ScrapeRunStatus.FAILED
            run.error = f"{type(exc).__name__}: {exc}"
            logger.exception("Το scrape απέτυχε")
            raise
        finally:
            run.finished_at = datetime.now(timezone.utc)
            run.http_requests = self.fetcher.request_count
            run.matches_created = self.stats.matches_created
            run.matches_updated = self.stats.matches_updated
            run.matches_unchanged = self.stats.matches_unchanged
            run.matches_deferred = self.stats.matches_deferred
            run.teams_created = self.stats.teams_created
            run.conflicts_opened = self.stats.conflicts_opened
            # Both land in one column: to a reader they are all lines of the
            # same report; only the status distinguishes them.
            run.warnings = [*self.stats.warnings, *self.stats.notes]

            if dry_run:
                # Nothing is kept, not even the run record: a dry run exists to
                # report what *would* happen, and a half-written audit trail is
                # worse than none.
                self.db.expunge(run)
                await self.db.rollback()
            else:
                await self.db.commit()

        return run

    # --- setup ----------------------------------------------------------

    # --- seasons --------------------------------------------------------

    def _read_periods(self, index_html: str) -> dict[str, str]:
        """Season label -> the source's period id, newest last."""
        parse_periods = getattr(self.source, "parse_periods", None)
        return parse_periods(index_html) if parse_periods is not None else {}

    def _choose_periods(
        self,
        periods: dict[str, str],
        config: dict,
        seasons: list[str] | None,
        all_seasons: bool,
    ) -> list[tuple[str, str | None, bool]]:
        """(season slug, period id, is_current) for each season to sync."""
        if not periods:
            # A source with no season selector publishes one season: whatever is
            # on the page. Fall back to the calendar year.
            year = datetime.now(timezone.utc).year
            slug = f"{year}-{year + 1}"
            self.stats.warn(f"Δεν βρέθηκε περίοδος στην πηγή· υποθέτω {slug}.")
            return [(slug, None, True)]

        # The highest period id is the running season, whatever order the
        # dropdown happens to be in.
        newest = max(periods, key=lambda label: int(periods[label]))

        if all_seasons:
            chosen = sorted(periods, key=lambda label: int(periods[label]))
        elif seasons:
            wanted = {w.strip() for w in seasons}
            chosen = [
                label
                for label in sorted(periods, key=lambda l: int(periods[l]))
                if label in wanted or periods[label] in wanted
            ]
            for w in wanted - set(chosen) - {periods[c] for c in chosen}:
                self.stats.warn(f"Άγνωστη περίοδος {w!r}· παραλείπεται.")
        else:
            configured = str(config.get("period_id") or "")
            chosen = [
                next((l for l, pid in periods.items() if pid == configured), newest)
            ]

        return [(label, periods[label], label == newest) for label in chosen]

    async def _ensure_season(self, slug: str, is_current: bool) -> Season:
        season = (
            await self.db.execute(
                select(Season).where(
                    Season.association_id == self.association.id,
                    Season.slug == slug,
                )
            )
        ).scalar_one_or_none()

        if season is None:
            season = Season(
                association_id=self.association.id,
                slug=slug,
                name=f"Περίοδος {slug}",
                is_current=is_current,
            )
            self.db.add(season)
            await self.db.flush()
        elif season.is_current != is_current:
            season.is_current = is_current
        return season

    async def _sync_season(
        self,
        slug: str,
        is_current: bool,
        index_html: str,
        config: dict,
        league_slugs: list[str] | None,
        use_league_filter: bool = True,
    ) -> None:
        season = await self._ensure_season(slug, is_current)
        scraped_leagues = self.source.parse_league_index(index_html)

        # league_ids pins the routine run to the divisions worth showing. It is
        # ignored in a backfill twice over: the ids differ every season, so an
        # older one would return nothing at all, and asking for every season is
        # asking for every category in it.
        wanted_ids = (
            config.get("league_ids") if is_current and use_league_filter else None
        )
        if wanted_ids:
            scraped_leagues = [
                l for l in scraped_leagues if l.external_id in set(wanted_ids)
            ]

        # Federation sites sometimes host competitions that are not theirs —
        # here, national youth leagues whose entrants are Superleague clubs.
        # Importing those would register Olympiakos as a club of ΕΠΣ Ηπείρου,
        # so which headings to skip is a fact about the site, kept in config.
        excluded = [e.casefold() for e in config.get("exclude_categories", [])]
        if excluded:
            kept = []
            for l in scraped_leagues:
                haystack = f"{l.category or ''} {l.name}".casefold()
                if any(e in haystack for e in excluded):
                    self.stats.note(f"Εκτός ένωσης, παραλείπεται: {l.name}")
                else:
                    kept.append(l)
            scraped_leagues = kept

        if not scraped_leagues:
            self.stats.warn(f"{slug}: η πηγή δεν επέστρεψε καμία διοργάνωση.")

        for scraped_league in scraped_leagues:
            league = await self._ensure_league(season, scraped_league)
            if league_slugs and league.slug not in league_slugs:
                continue
            await self._sync_league(league, scraped_league.external_id)

    async def _load_catalog(self) -> None:
        if not isinstance(self.source, CatalogSource):
            self.stats.warn(
                "Η πηγή δεν δημοσιεύει κατάλογο σωματείων· η αντιστοίχιση "
                "βασίζεται μόνο σε ονόματα."
            )
            await self.resolver.load_teams({}, "")
            await self.resolver.load_fields({})
            return

        teams_html = await self.fetcher.get(self.source.teams_path())
        await self.resolver.load_teams(
            self.source.parse_teams(teams_html), getattr(self.source, "key", "")
        )
        fields_html = await self.fetcher.get(self.source.fields_path())
        await self.resolver.load_fields(self.source.parse_fields(fields_html))

    async def _ensure_league(self, season: Season, scraped) -> League:
        league = (
            await self.db.execute(
                select(League).where(
                    League.association_id == self.association.id,
                    League.season_id == season.id,
                    League.external_id == scraped.external_id,
                )
            )
        ).scalar_one_or_none()
        if league is not None:
            return league

        taken = {
            slug
            for (slug,) in (
                await self.db.execute(
                    select(League.slug).where(
                        League.association_id == self.association.id,
                        League.season_id == season.id,
                    )
                )
            ).all()
        }
        category = naming.strip_accents(scraped.category or "").upper()
        league = League(
            association_id=self.association.id,
            season_id=season.id,
            slug=naming.unique_slug(naming.slugify(scraped.name), taken),
            name=scraped.name,
            short_name=scraped.category,
            kind=LeagueKind.CUP if "ΚΥΠΕΛΛΟ" in category else LeagueKind.CHAMPIONSHIP,
            tier=TIER_BY_CATEGORY.get(category),
            external_id=scraped.external_id,
            sort_order=TIER_BY_CATEGORY.get(category, 99),
        )
        self.db.add(league)
        await self.db.flush()
        return league

    # --- one league -----------------------------------------------------

    async def _sync_league(self, league: League, external_id: str) -> None:
        html = await self.fetcher.get(self.source.schedule_path(external_id))
        scraped = self.source.parse_schedule(html)
        if not scraped:
            self.stats.warn(f"Κανένας αγώνας στη σελίδα του {league.name}.")
            return

        now = datetime.now(timezone.utc)
        existing = {
            (m.matchday, m.home_team_id, m.away_team_id): m
            for m in (
                await self.db.execute(
                    select(Match).where(Match.league_id == league.id)
                )
            ).scalars()
        }
        participants: set[int] = set()

        for item in scraped:
            home = await self.resolver.team(item.home_team)
            away = await self.resolver.team(item.away_team)
            if home is None or away is None or home.id == away.id:
                continue
            participants.update({home.id, away.id})
            await self._apply(league, item, home, away, existing, now)

        await self._ensure_participation(league, participants)
        await self.db.flush()

        league.total_matchdays = max(
            (m.matchday for m in scraped if m.matchday), default=None
        )
        played = [m.matchday for m in scraped if m.is_played and m.matchday]
        league.current_matchday = max(played, default=None)

        await self._sync_standings(league, external_id)

    async def _apply(
        self,
        league: League,
        item: ScrapedMatch,
        home: Team,
        away: Team,
        existing: dict,
        now: datetime,
    ) -> None:
        venue = await self.resolver.field(item.venue_external_id, item.venue)
        wanted: dict[str, Any] = {
            "status": item.status,
            "home_score": item.home_score,
            "away_score": item.away_score,
            "kickoff_at": _to_utc(item.kickoff_date, item.kickoff_time),
            "field_id": venue.id if venue else None,
            "referee": item.referee,
            "note": item.note,
            "external_id": item.external_id,
        }

        current = existing.get((item.matchday, home.id, away.id))
        plan = plan_match(current, wanted, now)

        if plan.action is Action.CREATE:
            match = Match(
                league_id=league.id,
                matchday=item.matchday,
                home_team_id=home.id,
                away_team_id=away.id,
                last_scraped_at=now,
                **plan.changes,
            )
            self.db.add(match)
            self.stats.matches_created += 1
            return

        assert current is not None
        current.last_scraped_at = now

        if plan.changes:
            for name, value in plan.changes.items():
                setattr(current, name, value)
            if not plan.deferred:
                current.data_source = DataSource.SCRAPER
            self.stats.matches_updated += 1
        else:
            self.stats.matches_unchanged += 1

        if plan.deferred:
            self.stats.matches_deferred += 1
        if plan.conflict is not None:
            await self._record_conflict(current, plan.conflict)

    async def _record_conflict(self, match: Match, payload: dict) -> None:
        """Log a disagreement once, not once per run.

        The scraper visits every fixture on every pass; an unresolved conflict
        would otherwise pile up dozens of identical rows before an admin looked.
        """
        already = (
            await self.db.execute(
                select(ScrapeConflict).where(
                    ScrapeConflict.match_id == match.id,
                    ScrapeConflict.status == ConflictStatus.OPEN,
                )
            )
        ).scalars().first()
        if already is not None:
            already.scraped_value = payload["scraped"]
            already.current_value = payload["current"]
            return

        self.db.add(
            ScrapeConflict(
                match_id=match.id,
                scraped_value=payload["scraped"],
                current_value=payload["current"],
            )
        )
        self.stats.conflicts_opened += 1

    async def _ensure_participation(self, league: League, team_ids: set[int]) -> None:
        known = {
            lt.team_id: lt
            for lt in (
                await self.db.execute(
                    select(LeagueTeam).where(LeagueTeam.league_id == league.id)
                )
            ).scalars()
        }
        for team_id in team_ids - set(known):
            self.db.add(LeagueTeam(league_id=league.id, team_id=team_id))

    # --- standings ------------------------------------------------------

    async def _sync_standings(self, league: League, external_id: str) -> None:
        """Recompute our table, then use the published one to explain the gap.

        The table is never copied: it is derived from the fixtures we hold, so
        an editor's correction moves it immediately. The published table is used
        for one thing the results cannot reveal — a points deduction, which ΕΠΣ
        sites apply silently to the total.
        """
        await recompute_standings(self.db, league)

        try:
            html = await self.fetcher.get(self.source.standings_path(external_id))
            published = self.source.parse_standings(html)
        except Exception as exc:  # noqa: BLE001
            self.stats.warn(f"Δεν διαβάστηκε η βαθμολογία του {league.name}: {exc}")
            return
        if not published:
            return

        computed = {
            row.team_id: row
            for row in (
                await self.db.execute(
                    select(Standing).where(Standing.league_id == league.id)
                )
            ).scalars()
        }
        entries = {
            lt.team_id: lt
            for lt in (
                await self.db.execute(
                    select(LeagueTeam).where(LeagueTeam.league_id == league.id)
                )
            ).scalars()
        }

        changed = False
        for row in published:
            team = await self.resolver.team(row.team)
            if team is None:
                continue
            ours = computed.get(team.id)
            entry = entries.get(team.id)
            if ours is None or entry is None:
                continue

            # Our points already include any deduction we have recorded, so the
            # gap is the *additional* penalty the federation has applied.
            gap = ours.points - row.points
            if gap > 0:
                entry.points_deduction += gap
                changed = True
                # Not a warning: deriving the deduction is the point of
                # comparing the two tables, and it only fires the once, since
                # our next computation already includes it.
                self.stats.note(
                    f"{league.name}: αφαίρεση {gap} β. στο {team.name} "
                    f"(δικοί μας {ours.points}, επίσημοι {row.points})."
                )
            elif gap < 0:
                # The published table has *more* points than the results
                # justify. A federation does not award bonus points, so this
                # says our fixture list is short — a match the schedule page
                # never printed, or one whose clubs did not resolve. Writing a
                # negative deduction would paper over it and quietly invent
                # points, so it is reported instead.
                self.stats.warn(
                    f"{league.name}: λείπουν αποτελέσματα για {team.name} "
                    f"(δικοί μας {ours.points}, επίσημοι {row.points}· "
                    f"αγώνες {ours.played} έναντι {row.played})."
                )

        if changed:
            await self.db.flush()
            await recompute_standings(self.db, league)


async def sync_association(
    db: AsyncSession,
    association: Association,
    source: Source,
    fetcher: Fetcher,
    league_slugs: list[str] | None = None,
    dry_run: bool = False,
    seasons: list[str] | None = None,
    all_seasons: bool = False,
) -> ScrapeRun:
    return await Syncer(db, association, source, fetcher).sync(
        league_slugs=league_slugs,
        dry_run=dry_run,
        seasons=seasons,
        all_seasons=all_seasons,
    )
