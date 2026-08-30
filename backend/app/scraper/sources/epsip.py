"""Adapter for epsip.gr (ΕΠΣ Ηπείρου) and any site running the same PHP app.

The site is generous once you know where to look: one request to
`display_schedule.php?league_id=N` returns an entire season — matchday, both
clubs, venue, date, time, referees and the result — and every row links to a
stable `game_id`, every venue to a `field_id`, every club (from teams.php) to a
`team_id`. Identity therefore comes from the source's own ids where they exist —
`team_id` and `field_id` always, `game_id` only for matches that have a report.
"""

from __future__ import annotations

import re
from datetime import date, time

from bs4 import BeautifulSoup, Tag

from app.models.enums import MatchStatus
from app.scraper.types import ScrapedLeague, ScrapedMatch, ScrapedStanding

# "1η Αγωνιστική"
_MATCHDAY = re.compile(r"(\d+)\s*η\s+Αγωνιστ", re.IGNORECASE)
# "2-0" or "3-0 α.α." (κατακύρωση — a walkover, not a played match)
_SCORE = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s*(α\.?\s*α\.?)?\s*$")
_DATE = re.compile(r"^\s*(\d{1,2})/(\d{1,2})/(\d{2,4})\s*$")
_TIME = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*$")
_ID_PARAM = re.compile(r"[?&](\w+_id)=(\d+)")

# The site separates the two clubs with a spaced hyphen inside one cell.
_VS = " - "


def _text(node: Tag | None) -> str:
    if node is None:
        return ""
    # separator="" so a <br /> inside a name does not invent a space; the
    # site uses <br /> purely for line wrapping.
    return re.sub(r"\s+", " ", node.get_text("")).strip()


def _param(node: Tag | None, name: str) -> str | None:
    """Pull `?…&<name>=<digits>` out of the first link under `node`."""
    if node is None:
        return None
    anchor = node if node.name == "a" else node.find("a")
    if not isinstance(anchor, Tag):
        return None
    href = anchor.get("href")
    if not isinstance(href, str):
        return None
    for key, value in _ID_PARAM.findall(href):
        if key == name:
            return value
    return None


def _parse_date(value: str) -> date | None:
    m = _DATE.match(value)
    if not m:
        return None
    day, month, year = (int(g) for g in m.groups())
    if year < 100:
        # The site writes two-digit years. These are league fixtures, so the
        # 2000s are the only sane reading.
        year += 2000
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _parse_time(value: str) -> time | None:
    m = _TIME.match(value)
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))
    return time(hour, minute) if hour < 24 and minute < 60 else None


class EpsipSource:
    key = "epsip"

    # --- discovery ------------------------------------------------------

    def league_index_path(self, period_id: str | None = None) -> str:
        path = "/results/ranking.php"
        return f"{path}?period_id={period_id}" if period_id else path

    def parse_league_index(self, html: str) -> list[ScrapedLeague]:
        """Read the competition list. Headings ("Α Κατηγορία", "Κ 16") group the
        links beneath them, so the current heading is carried down."""
        soup = BeautifulSoup(html, "html.parser")
        leagues: list[ScrapedLeague] = []
        category: str | None = None

        for node in soup.find_all(["h4", "a"]):
            if node.name == "h4":
                category = _text(node) or None
                continue
            league_id = _param(node, "league_id")
            if league_id:
                leagues.append(
                    ScrapedLeague(
                        external_id=league_id,
                        name=_text(node),
                        category=category,
                    )
                )
        return leagues

    def parse_periods(self, html: str) -> dict[str, str]:
        """Season slug -> period_id, from the season dropdown."""
        soup = BeautifulSoup(html, "html.parser")
        select = soup.find("select", attrs={"name": "period_id"})
        if not isinstance(select, Tag):
            return {}
        return {
            _text(option): value
            for option in select.find_all("option")
            if isinstance(value := option.get("value"), str)
        }

    # --- fixtures and results -------------------------------------------

    def schedule_path(self, league_external_id: str) -> str:
        return f"/results/display_schedule.php?league_id={league_external_id}"

    def parse_schedule(self, html: str) -> list[ScrapedMatch]:
        soup = BeautifulSoup(html, "html.parser")
        matches: list[ScrapedMatch] = []
        matchday: int | None = None

        # Headings and tables are siblings in document order: <h2>Nη
        # Αγωνιστική</h2><table>…</table>, repeated.
        for node in soup.find_all(["h2", "h3", "tr"]):
            if node.name in ("h2", "h3"):
                if m := _MATCHDAY.search(_text(node)):
                    matchday = int(m.group(1))
                continue

            cells = node.find_all("td")
            if len(cells) < 6 or matchday is None:
                continue

            parsed = self._parse_row(cells, matchday)
            if parsed is not None:
                matches.append(parsed)

        return matches

    def _parse_row(self, cells: list[Tag], matchday: int) -> ScrapedMatch | None:
        pairing = _text(cells[0])
        parts = pairing.split(_VS)
        if len(parts) != 2:
            # A club name containing " - " would land here. None do today, and
            # inventing a split would attach results to the wrong team, so the
            # row is dropped and reported instead.
            return None
        home, away = (p.strip() for p in parts)
        if not home or not away:
            return None

        venue = _text(cells[1]) or None
        venue_external_id = _param(cells[1], "field_id")
        external_id = _param(cells[0], "game_id")
        kickoff_date = _parse_date(_text(cells[3]))
        kickoff_time = _parse_time(_text(cells[4]))
        referee = _text(cells[5]) or None

        home_score = away_score = None
        note = None
        status = MatchStatus.SCHEDULED
        raw_result = _text(cells[6]) if len(cells) > 6 else ""
        if raw_result:
            if m := _SCORE.match(raw_result):
                home_score, away_score = int(m.group(1)), int(m.group(2))
                # "α.α." marks a walkover: the scoreline is administrative, so
                # it counts for the table but was never played.
                status = (
                    MatchStatus.AWARDED if m.group(3) else MatchStatus.FINISHED
                )
            else:
                # Postponements and annotations show up here as free text. The
                # fixture is kept, unplayed, and the text is carried through so
                # a reader sees what the federation actually wrote.
                status = MatchStatus.POSTPONED
                note = raw_result

        return ScrapedMatch(
            matchday=matchday,
            home_team=home,
            away_team=away,
            venue=venue,
            kickoff_date=kickoff_date,
            kickoff_time=kickoff_time,
            home_score=home_score,
            away_score=away_score,
            status=status,
            referee=referee,
            external_id=external_id,
            venue_external_id=venue_external_id,
            note=note,
        )

    # --- standings ------------------------------------------------------

    def standings_path(self, league_external_id: str) -> str:
        return f"/results/display_ranking.php?league_id={league_external_id}"

    def parse_standings(self, html: str) -> list[ScrapedStanding]:
        soup = BeautifulSoup(html, "html.parser")
        rows: list[ScrapedStanding] = []

        for tr in soup.find_all("tr"):
            cells = [_text(td) for td in tr.find_all("td")]
            if len(cells) < 9:
                continue
            position = cells[0].rstrip(".").strip()
            if not position.isdigit():
                continue
            try:
                # Points can be negative: a withdrawn club carries its penalty
                # into the published total.
                numbers = [int(c) for c in cells[2:9]]
            except ValueError:
                continue

            points, played, won, drawn, lost, goals_for, goals_against = numbers
            rows.append(
                ScrapedStanding(
                    position=int(position),
                    team=cells[1],
                    points=points,
                    played=played,
                    won=won,
                    drawn=drawn,
                    lost=lost,
                    goals_for=goals_for,
                    goals_against=goals_against,
                )
            )
        return rows

    # --- catalog --------------------------------------------------------

    def teams_path(self) -> str:
        return "/teams/teams.php"

    def parse_teams(self, html: str) -> dict[str, str]:
        """team_id -> club name, from teams.php.

        This is what makes name matching a convenience rather than the identity
        mechanism: the association's whole club list arrives with stable ids.
        """
        soup = BeautifulSoup(html, "html.parser")
        teams: dict[str, str] = {}
        for anchor in soup.find_all("a"):
            team_id = _param(anchor, "team_id")
            name = _text(anchor)
            if team_id and name:
                teams[team_id] = name
        return teams

    def fields_path(self) -> str:
        return "/field/fields_map.php"

    def parse_fields(self, html: str) -> dict[str, str]:
        """field_id -> venue name, from fields_map.php."""
        soup = BeautifulSoup(html, "html.parser")
        fields: dict[str, str] = {}
        for anchor in soup.find_all("a"):
            field_id = _param(anchor, "field_id")
            name = _text(anchor)
            if field_id and name:
                fields.setdefault(field_id, name)
        return fields
