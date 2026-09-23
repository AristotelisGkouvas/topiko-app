"""The calendar feed.

Tested closely because iCalendar fails quietly: a wrong line ending or an
unescaped comma does not raise anywhere, it just makes one calendar app show
an empty subscription while another looks perfectly fine.
"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.models.enums import MatchStatus
from app.services.icalendar import CRLF, _escape, _fold, build_calendar

NOW = datetime(2026, 9, 27, 9, 0, tzinfo=UTC)

#: Built rather than written literally: a backslash in a test about escaping
#: backslashes is one transcription away from testing the wrong thing.
BS = chr(92)


def team(name: str = "Α.Ο. ΑΝΑΤΟΛΗΣ") -> SimpleNamespace:
    return SimpleNamespace(name=name, slug="a-o-anatolis")


def match(**kwargs) -> SimpleNamespace:
    base = {
        "id": 1,
        "kickoff_at": datetime(2026, 9, 27, 14, 0, tzinfo=UTC),
        "matchday": 3,
        "home_team": SimpleNamespace(name="Α.Ο. ΑΝΑΤΟΛΗΣ"),
        "away_team": SimpleNamespace(name="ΘΥΕΛΛΑ ΕΛΕΟΥΣΑΣ"),
        "home_score": None,
        "away_score": None,
        "field": SimpleNamespace(name="ΚΡΑΝΟΥΛΑΣ"),
        "status": MatchStatus.SCHEDULED,
        "updated_at": datetime(2026, 9, 20, 8, 0, tzinfo=UTC),
    }
    return SimpleNamespace(**{**base, **kwargs})


def build(*matches, **kwargs) -> str:
    return build_calendar(
        team(), list(matches), association_slug="epsip-ipeirou", now=NOW, **kwargs
    )


def test_lines_end_crlf() -> None:
    # iOS is not reliably forgiving about bare LF.
    body = build(match())
    assert CRLF in body
    assert "\n" not in body.replace(CRLF, "")


def test_it_opens_and_closes_as_a_calendar() -> None:
    body = build(match())
    assert body.startswith("BEGIN:VCALENDAR" + CRLF)
    assert body.rstrip().endswith("END:VCALENDAR")


def test_a_fixture_becomes_an_event() -> None:
    body = build(match())
    assert "BEGIN:VEVENT" in body
    assert "DTSTART:20260927T140000Z" in body
    assert "UID:match-1@pamesentra" in body


def test_a_fixture_without_a_date_is_left_out() -> None:
    # A list can say "to be arranged"; a calendar cannot.
    assert "BEGIN:VEVENT" not in build(match(kickoff_at=None))


def test_the_uid_is_stable_so_an_edit_updates_in_place() -> None:
    first = build(match())
    later = build(match(kickoff_at=datetime(2026, 9, 28, 14, 0, tzinfo=UTC)))
    assert "UID:match-1@pamesentra" in first
    assert "UID:match-1@pamesentra" in later


def test_a_changed_row_raises_the_sequence() -> None:
    old = build(match())
    new = build(match(updated_at=datetime(2026, 9, 26, 8, 0, tzinfo=UTC)))
    assert old.count("SEQUENCE:") == new.count("SEQUENCE:") == 1
    assert old != new


def test_a_cancelled_match_says_so() -> None:
    assert "STATUS:CANCELLED" in build(match(status=MatchStatus.CANCELLED))


def test_a_postponement_is_tentative_not_cancelled() -> None:
    # It is still going to be played, just not then.
    assert "STATUS:TENTATIVE" in build(match(status=MatchStatus.POSTPONED))


def test_a_played_match_carries_its_score() -> None:
    body = build(match(home_score=2, away_score=1))
    assert "2-1" in body


def test_commas_and_semicolons_are_escaped() -> None:
    # An unescaped comma in a club name ends the property value early and the
    # rest of the line is read as another parameter.
    body = build(match(field=SimpleNamespace(name="ΓΗΠΕΔΟ, ΖΙΤΣΑΣ; ΝΕΟ")))
    expected = "LOCATION:" + "ΓΗΠΕΔΟ" + BS + ", ΖΙΤΣΑΣ" + BS + "; ΝΕΟ"
    assert expected in body


def test_escaping_does_not_double_escape_backslashes() -> None:
    assert _escape("a" + BS + "b") == "a" + BS + BS + "b"


def test_long_greek_lines_fold_without_splitting_a_character() -> None:
    line = "SUMMARY:" + "Α" * 120
    folded = _fold(line)
    # Every continuation starts with one space, and the whole thing still
    # decodes — a fold through the middle of a two-byte letter would not.
    assert CRLF + " " in folded
    for piece in folded.split(CRLF)[1:]:
        assert piece.startswith(" ")
    assert folded.replace(CRLF + " ", "") == line


def test_short_lines_are_untouched() -> None:
    assert _fold("VERSION:2.0") == "VERSION:2.0"


def test_a_link_back_to_the_match_when_a_site_is_configured() -> None:
    body = build(match(), site_url="https://pamesentra.gr/")
    assert "URL:https://pamesentra.gr/agones/1" in body
