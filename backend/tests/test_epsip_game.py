"""The match report parser, against saved pages from epsip.gr.

Five reports, chosen for what they contain: an ordinary one (24372), one with
two reds and a second yellow (24395), a penalty (24381), an own goal (6501),
and an id with no match behind it (18000).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.scraper.sources.epsip import EpsipSource

FIXTURES = Path(__file__).parent / "fixtures" / "epsip"


def sheet(game_id: int):
    html = (FIXTURES / f"display_game_{game_id}.html").read_text(encoding="utf-8", errors="replace")
    return EpsipSource().parse_game(html)


def test_the_header_gives_both_clubs_and_the_score() -> None:
    s = sheet(24372)
    assert s is not None
    assert (s.home_team_external_id, s.away_team_external_id) == ("57", "204")
    assert (s.home_score, s.away_score) == (2, 0)


@pytest.mark.parametrize("game_id", [24372, 24395, 24381, 6501])
def test_the_goals_add_up_to_the_score(game_id: int) -> None:
    s = sheet(game_id)
    assert s is not None
    home = away = 0
    for e in s.events:
        if e.kind in ("goal", "penalty_goal"):
            home, away = (home + 1, away) if e.side == "home" else (home, away + 1)
        elif e.kind == "own_goal":
            # Listed under the scorer's own club; it counts for the other one.
            home, away = (home, away + 1) if e.side == "home" else (home + 1, away)
    assert (home, away) == (s.home_score, s.away_score)
    assert s.unknown == []


def test_a_goal_carries_its_scorer_minute_and_running_score() -> None:
    s = sheet(24372)
    assert s is not None
    first = next(e for e in s.events if e.kind == "goal")
    assert first.side == "home"
    assert first.player_external_id == "12366"
    assert first.player_name == "ΠΑΝΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ"
    assert (first.minute, first.score) == (15, "1-0")


def test_cards_are_told_apart() -> None:
    s = sheet(24395)
    assert s is not None
    kinds = [e.kind for e in s.events]
    assert kinds.count("red") == 2
    assert kinds.count("second_yellow") == 1
    assert "yellow" in kinds


def test_a_penalty_and_an_own_goal_are_their_own_kinds() -> None:
    penalty = sheet(24381)
    own = sheet(6501)
    assert penalty is not None and own is not None
    assert [e.minute for e in penalty.events if e.kind == "penalty_goal"] == [83]
    og = next(e for e in own.events if e.kind == "own_goal")
    assert (og.side, og.minute, og.score) == ("home", 68, "2-2")


def test_substitutions_come_in_pairs() -> None:
    s = sheet(24372)
    assert s is not None
    ins = [e for e in s.events if e.kind == "sub_in"]
    outs = [e for e in s.events if e.kind == "sub_out"]
    assert len(ins) == len(outs) == 9


def test_both_line_ups_with_the_bench() -> None:
    s = sheet(24372)
    assert s is not None
    starters = [p for p in s.lineups if p.starter]
    assert len([p for p in starters if p.side == "home"]) == 11
    assert len([p for p in starters if p.side == "away"]) == 11
    bench = [p for p in s.lineups if not p.starter]
    assert bench, "the substitutes are listed too"
    sample = next(p for p in s.lineups if p.player_external_id == "11178")
    assert (sample.side, sample.player_name, sample.birth_year) == ("home", "ΣΑΟΥΓΚΟΣ ΓΕΩΡΓΙΟΣ", 2005)
    away = next(p for p in s.lineups if p.player_external_id == "831")
    assert (away.side, away.birth_year) == ("away", 1991)


def test_the_officials_are_read_by_label() -> None:
    s = sheet(24372)
    assert s is not None
    assert s.officials["Διαιτητής"] == "ΔΑΔΑΝΗΣ ΑΠΟΣΤΟΛΟΣ"
    assert s.officials["Α' Βοηθός Διαιτητή"] == "ΚΑΤΣΟΥΛΙΔΟΥ ΠΟΛΥΞΕΝΗ"
    # Empty labels are left out rather than stored as "".
    assert "4ος Διαιτητής" not in s.officials


def test_an_id_with_no_match_is_no_report() -> None:
    assert sheet(18000) is None
