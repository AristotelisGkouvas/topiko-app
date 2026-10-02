import { describe, expect, it } from "vitest";

import { feedMoments, sheetMoments } from "./moments";
import type { MatchFeed, SheetEvent } from "./types";

const HOME = 1;
const AWAY = 2;

const ev = (e: Partial<SheetEvent>): SheetEvent =>
  ({ kind: "goal", minute: null, team_id: null, player: null, player_name: null, score: null, ...e }) as SheetEvent;

describe("sheetMoments", () => {
  it("pairs a change into one row, the one going off as its note", () => {
    const rows = sheetMoments(
      [
        ev({ kind: "sub_out", minute: 58, team_id: HOME, player_name: "Γκόγκος Α." }),
        ev({ kind: "sub_in", minute: 58, team_id: HOME, player_name: "Καραγιάννης Δ." }),
      ],
      HOME,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "sub", name: "Καραγιάννης Δ.", note: "Βγαίνει: Γκόγκος Α.", home: true, half: 2 });
  });

  it("puts an own goal with the side it counted for", () => {
    const [row] = sheetMoments([ev({ kind: "own_goal", minute: 30, team_id: AWAY, score: "1-0" })], HOME);
    expect(row).toMatchObject({ home: true, score: "1 - 0", note: "Αυτογκόλ" });
  });

  it("keeps first-half stoppage time in the first half", () => {
    const [row] = sheetMoments([ev({ kind: "yellow", minute: 45, stoppage: 2, team_id: HOME })], HOME);
    expect(row.half).toBe(1);
  });
});

describe("feedMoments", () => {
  it("follows the log's half-time marker and counts the score", () => {
    const team = (id: number) => ({ id, slug: `t${id}`, name: `T${id}` });
    const feed = {
      events: [
        { id: 1, kind: "goal", minute: 10, team: team(HOME), created_at: "" },
        { id: 2, kind: "halftime", minute: null, team: null, created_at: "" },
        { id: 3, kind: "goal", minute: null, team: team(AWAY), created_at: "" },
        { id: 4, kind: "note", minute: 50, team: null, created_at: "" },
      ],
    } as unknown as MatchFeed;
    const rows = feedMoments(feed, HOME);
    expect(rows.map((r) => [r.half, r.score])).toEqual([
      [1, "1 - 0"],
      [2, "1 - 1"],
    ]);
  });
});
