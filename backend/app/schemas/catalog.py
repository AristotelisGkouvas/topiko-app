from datetime import date
from decimal import Decimal

from app.models.enums import FieldSurface, LeagueKind, StandingZone
from app.schemas.common import ORMModel


class AssociationOut(ORMModel):
    id: int
    slug: str
    name: str
    short_name: str | None = None
    region: str | None = None
    source_url: str | None = None
    logo_url: str | None = None
    primary_color: str | None = None


class SeasonOut(ORMModel):
    id: int
    slug: str
    name: str
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool


class FieldRef(ORMModel):
    """Just enough to render the venue line on a match card, and the ground
    card on a club page: the kit prints "Έδρα · χλοοτάπητας · 800 θέσεις", and
    surface is the one field the federation fills in for every ground."""

    id: int
    slug: str
    name: str
    short_name: str | None = None
    city: str | None = None
    surface: FieldSurface | None = None
    capacity: int | None = None


class FieldOut(FieldRef):
    address: str | None = None
    postal_code: str | None = None
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    surface: FieldSurface | None = None
    capacity: int | None = None
    has_floodlights: bool | None = None
    notes: str | None = None


class TeamRef(ORMModel):
    """Team as it appears inside a match card or a standings row."""

    id: int
    slug: str
    name: str
    short_name: str | None = None
    initials: str | None = None
    logo_url: str | None = None
    #: The disc behind the initials when there is no logo. On every reference
    #: rather than only the club page, because the crest is drawn in every
    #: list and a club in its own colour there is the point of having one.
    primary_color: str | None = None


class FieldDetailOut(FieldOut):
    """The ground's own page.

    Adds the clubs that call it home — which is the only thing that makes a
    ground more than a name and a surface type. The list endpoint does not
    carry them: it renders 114 cards, and a relationship loaded 114 times to
    print something the card has no room for is a query nobody asked for.
    """

    home_teams: list[TeamRef] = []


class TeamPhotoOut(ORMModel):
    id: int
    url: str
    thumb_url: str
    width: int
    height: int
    caption: str | None = None


class SponsorOut(ORMModel):
    id: int
    name: str
    website_url: str | None = None
    logo_url: str | None = None


class SponsorAdminOut(SponsorOut):
    """What the dashboard sees: the inactive ones too, and in which order."""

    position: int
    is_active: bool


class TeamOut(TeamRef):
    founded_year: int | None = None
    city: str | None = None
    secondary_color: str | None = None
    home_field: FieldRef | None = None
    #: Whether the club had a place in a competition this season or last.
    #: Only the club list fills it — null elsewhere, and when no season is
    #: marked current, rather than calling every club inactive.
    active: bool | None = None


class TeamDetailOut(TeamOut):
    """One club, with the seasons it actually played in.

    A club that folded in 2019 has ten years of matches and none this season,
    so a page pinned to the current one is blank for half the register. The
    list is only computed for a single club — doing it for all 172 would be a
    query per row.
    """

    seasons: list[str] = []
    photos: list[TeamPhotoOut] = []
    #: Active ones only, main sponsor first.
    sponsors: list[SponsorOut] = []


class LeagueOut(ORMModel):
    id: int
    slug: str
    name: str
    short_name: str | None = None
    kind: LeagueKind
    tier: int | None = None
    #: "Κ10", "Παίδων", … Absent for the open-age divisions, which is how the
    #: reader tells a club championship from an academy one.
    age_group: str | None = None
    group_name: str | None = None
    total_matchdays: int | None = None
    current_matchday: int | None = None
    #: Positions per band, e.g. {"promotion": [1], "relegation": [13, 14]}.
    zones: dict[StandingZone, list[int]] = {}
    season: SeasonOut
