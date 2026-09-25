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
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from bs4 import BeautifulSoup, Tag

from app.models.enums import MatchStatus
from app.scraper.labels import LeagueLabel, describe_league
from app.scraper.types import (
    ScrapedAnnouncement,
    ScrapedField,
    ScrapedLeague,
    ScrapedMatch,
    ScrapedPlayer,
    ScrapedPlayerStat,
    ScrapedStanding,
    ScrapedSuspension,
)

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


# "players.php?page=17" — every page links every other, so the highest wins.
_PLAYER_PAGE = re.compile(r"players\.php\?page=(\d+)")

# Leading digits: "23", "10", "1980 '" for minutes, "25η" for a matchday.
_COUNT = re.compile(r"(-?\d+)")

#: The heading above each leaderboard, and the column it fills.
_STAT_FIELDS = {
    "Σκόρερς": "goals",
    "Αυτογκόλ": "own_goals",
    "Κόκκινες Κάρτες": "red_cards",
    "Κίτρινες Κάρτες": "yellow_cards",
    "Λεπτά Συμμετοχής": "minutes",
}


def _count(value: str) -> int | None:
    m = _COUNT.search(value)
    return int(m.group(1)) if m else None


def _year(value: str) -> int | None:
    """A four-digit birth year, or nothing. The register leaves it blank."""
    m = re.fullmatch(r"\s*(\d{4})\s*", value)
    return int(m.group(1)) if m else None


class EpsipSource:
    key = "epsip"

    def describe_league(self, name: str) -> LeagueLabel:
        """The generic reader was written against this site's 237 titles, so
        it is this adapter's reader as it stands."""
        return describe_league(name)

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

    #: The register's surface wording, mapped onto our own enum.
    _SURFACES = {
        "φυσικος χλοοταπητας": "grass",
        "συνθετικος χλοοταπητας": "artificial",
        "ξερο": "dirt",
    }

    def parse_fields(self, html: str) -> dict[str, ScrapedField]:
        """field_id -> the ground, from fields_map.php.

        Despite the file name that page is a table, not a map, and it carries
        more than the name: every row has a surface and a floodlight flag, and
        some have a location and a capacity. All of it was being thrown away.

        The columns headed Μήκος and Πλάτος are the pitch's length and width in
        metres — 65 to 106 by 45 to 65 across the rows that fill them in. They
        are *not* longitude and latitude, which is what those two words
        otherwise mean and what a reader of this parser will assume; reading
        them that way would put every ground in the Arctic.
        """
        soup = BeautifulSoup(html, "html.parser")
        fields: dict[str, ScrapedField] = {}

        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 8:
                continue
            anchor = row.find("a", href=True)
            field_id = _param(anchor, "field_id") if anchor else None
            name = _text(anchor) if anchor else None
            if not field_id or not name:
                continue

            fields.setdefault(
                field_id,
                ScrapedField(
                    external_id=field_id,
                    name=name,
                    location=_text(cells[2]) or None,
                    surface=self._SURFACES.get(_fold(_text(cells[3]))),
                    has_floodlights=_yes_no(_text(cells[7])),
                    capacity=_positive_int(_text(cells[9])) if len(cells) > 9 else None,
                ),
            )
        return fields


    # --- announcements ---------------------------------------------------

    def announcements_path(self) -> str:
        return "/announcements/announcements.php"

    def parse_announcements(self, html_text: str) -> list[ScrapedAnnouncement]:
        """Notices from announcements.php.

        Each is a `div.announcement` holding `<b>title</b>, <i>date</i>` and
        then the body. There is no id and no per-item link, so identity has to
        be the title and the time it carries.

        The Greek arrives as HTML entities — `&Eta;&Pi;&Sigma;` rather than
        ΕΠΣ — which BeautifulSoup decodes for us. Reading this page with a
        plain regex would store the entities verbatim and the site would show
        them to the reader.
        """
        soup = BeautifulSoup(html_text, "html.parser")
        out: list[ScrapedAnnouncement] = []

        for block in soup.find_all("div", class_="announcement"):
            title_el = block.find("b")
            title = _text(title_el) if title_el else ""
            if not title:
                continue

            date_el = block.find("i")
            published = _announcement_date(_text(date_el)) if date_el else None

            # The body is whatever is left once the heading line is removed.
            for el in (title_el, date_el):
                if el is not None:
                    el.decompose()
            image = block.find("img")
            image_src = image.get("src") if image else None
            if image is not None:
                image.decompose()

            body = re.sub(r"\s+", " ", block.get_text(" ", strip=True)).strip(" ,")

            out.append(
                ScrapedAnnouncement(
                    title=title,
                    published_at=published,
                    body=body or None,
                    image_url=_absolute_image(image_src),
                )
            )
        return out

    # --- players, statistics and suspensions -----------------------------

    def players_path(self, page: int = 1) -> str:
        return f"/players/players.php?page={page}"

    def parse_player_pages(self, html: str) -> int:
        """How many pages the register is spread over.

        The site paginates 300 at a time and links every page from every page,
        so the highest number in those links is the total.
        """
        return max(
            (int(m.group(1)) for m in _PLAYER_PAGE.finditer(html)),
            default=1,
        )

    def parse_players(self, html: str) -> list[ScrapedPlayer]:
        soup = BeautifulSoup(html, "html.parser")
        players: list[ScrapedPlayer] = []
        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 3:
                continue
            external_id = _param(cells[1], "player_id")
            name = _text(cells[1])
            if not external_id or not name:
                continue
            players.append(
                ScrapedPlayer(
                    external_id=external_id,
                    name=name,
                    birth_year=_year(_text(cells[2])),
                )
            )
        return players

    def stats_path(self, league_external_id: str) -> str:
        return f"/results/stats/display_stats.php?league_id={league_external_id}"

    def parse_stats(self, html: str) -> list[ScrapedPlayerStat]:
        """Merge the five published leaderboards into one row per player.

        Each table is a separate top-N list under its own heading, so a player
        appears in as many as they place in. Counts they do not place in stay
        None — see ScrapedPlayerStat.
        """
        soup = BeautifulSoup(html, "html.parser")
        merged: dict[str, dict] = {}

        for heading in soup.find_all(["h2", "h3"]):
            field = _STAT_FIELDS.get(_text(heading))
            if field is None:
                continue
            table = heading.find_next("table")
            if table is None:
                continue
            for row in table.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) < 4:
                    continue
                player_id = _param(cells[1], "player_id")
                if not player_id:
                    continue
                value = _count(_text(cells[3]))
                if value is None:
                    continue
                entry = merged.setdefault(
                    player_id,
                    {
                        "player_external_id": player_id,
                        "player_name": _text(cells[1]),
                        "team_external_id": _param(cells[2], "team_id"),
                        "team_name": _text(cells[2]) or None,
                    },
                )
                entry[field] = value

        return [ScrapedPlayerStat(**entry) for entry in merged.values()]

    def forfeits_path(self, league_external_id: str) -> str:
        return (
            "/results/display_player_forfeits.php"
            f"?league_id={league_external_id}"
        )

    def parse_forfeits(self, html: str) -> list[ScrapedSuspension]:
        soup = BeautifulSoup(html, "html.parser")
        out: list[ScrapedSuspension] = []
        for row in soup.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 5:
                continue
            player_id = _param(cells[3], "player_id")
            matches = _count(_text(cells[4]))
            if not player_id or matches is None:
                continue
            out.append(
                ScrapedSuspension(
                    player_external_id=player_id,
                    player_name=_text(cells[3]),
                    matches=matches,
                    matchday=_count(_text(cells[1])),
                    decided_on=_parse_date(_text(cells[0])),
                    fixture=_text(cells[2]) or None,
                    match_external_id=_param(cells[2], "game_id"),
                )
            )
        return out

def _fold(value: str) -> str:
    """Lower-case and strip accents, so "Φυσικός" matches "φυσικος"."""
    import unicodedata

    stripped = unicodedata.normalize("NFD", value.strip().lower())
    return "".join(c for c in stripped if unicodedata.category(c) != "Mn")


def _yes_no(value: str) -> bool | None:
    folded = _fold(value)
    if folded.startswith("ναι"):
        return True
    if folded.startswith("οχι"):
        return False
    return None


def _positive_int(value: str) -> int | None:
    """Zero means "not recorded" in this register, not "no seats"."""
    try:
        number = int(value.strip())
    except (TypeError, ValueError):
        return None
    return number or None

#: Notice times are Greek wall-clock, like kickoffs.
ATHENS = ZoneInfo("Europe/Athens")


#: The source writes "22/9/2026 08:00", Greek local time, sometimes without
#: the time at all.
_ANNOUNCEMENT_FORMATS = ("%d/%m/%Y %H:%M", "%d/%m/%Y")


def _announcement_date(value: str) -> datetime | None:
    cleaned = value.strip().strip(",").strip()
    for fmt in _ANNOUNCEMENT_FORMATS:
        try:
            naive = datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
        # Stored UTC like every other time here. A notice posted at 08:00 in
        # Greece is not 08:00 UTC, and a list sorted on the wrong one puts the
        # morning's notice after the evening's.
        return naive.replace(tzinfo=ATHENS).astimezone(UTC)
    return None


def _absolute_image(src: str | None) -> str | None:
    """The source writes './../images/...'. Resolved against the site root so
    the page does not have to know where it came from."""
    if not src:
        return None
    cleaned = src.lstrip(".").lstrip("/")
    cleaned = cleaned.removeprefix("../")
    return f"https://epsip.gr/{cleaned}"
