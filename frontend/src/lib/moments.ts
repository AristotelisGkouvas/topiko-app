import type { MatchFeed, SheetEvent } from "@/lib/types";

/** One line of the match timeline, whichever log it came from. */
export interface Moment {
  minute: number | null;
  stoppage?: number | null;
  /** Which column: the side the moment counts for. An own goal sits with
   *  the club it was scored *for*, beside the score it changed. */
  home: boolean;
  kind: "goal" | "penalty_goal" | "own_goal" | "penalty_miss" | "yellow" | "second_yellow" | "red" | "sub";
  name: string;
  href?: string;
  note?: string;
  /** The running score after a goal, "2 - 1". */
  score?: string;
  half: 1 | 2;
}

export const isGoal = (kind: string) =>
  kind === "goal" || kind === "penalty_goal" || kind === "own_goal";

export const MOMENT_LABELS: Record<Moment["kind"], string> = {
  goal: "Γκολ",
  penalty_goal: "Γκολ με πέναλτι",
  own_goal: "Αυτογκόλ",
  penalty_miss: "Χαμένο πέναλτι",
  yellow: "Κίτρινη",
  second_yellow: "Δεύτερη κίτρινη",
  red: "Κόκκινη",
  sub: "Αλλαγή",
};

/** Both logs' kinds onto the timeline's; anything else (kickoff, notes…)
 *  is not a moment. */
const KINDS: Record<string, Moment["kind"]> = {
  goal: "goal",
  penalty_goal: "penalty_goal",
  own_goal: "own_goal",
  penalty_miss: "penalty_miss",
  yellow: "yellow",
  second_yellow: "second_yellow",
  red: "red",
  sub_in: "sub",
  substitution: "sub",
};

const NOTES: Record<string, string> = {
  penalty_goal: "Πέναλτι",
  own_goal: "Αυτογκόλ",
  penalty_miss: "Χαμένο πέναλτι",
  second_yellow: "Δεύτερη κίτρινη",
};

/** 45+2 is still the first half; 46 on is the second. */
const halfOf = (minute: number | null | undefined): 1 | 2 =>
  minute != null && minute > 45 ? 2 : 1;

/** The federation's report as moments. A substitution is one row — the
 *  player coming on, with the one going off as its note — not two. */
export function sheetMoments(events: SheetEvent[], homeTeamId: number): Moment[] {
  const paired = new Set<number>();
  const out: Moment[] = [];
  for (const e of events) {
    const kind = KINDS[e.kind];
    if (!kind) continue;
    let note = NOTES[e.kind];
    if (e.kind === "sub_in") {
      const j = events.findIndex(
        (o, k) =>
          !paired.has(k) && o.kind === "sub_out" && o.team_id === e.team_id && o.minute === e.minute,
      );
      if (j >= 0) {
        paired.add(j);
        note = `Βγαίνει: ${events[j].player?.name ?? events[j].player_name ?? "άγνωστος"}`;
      }
    }
    const ownSide = e.team_id === homeTeamId;
    out.push({
      minute: e.minute ?? null,
      stoppage: e.stoppage,
      home: e.kind === "own_goal" ? !ownSide : ownSide,
      kind,
      name: e.player?.name ?? e.player_name ?? "Άγνωστος",
      href: e.player ? `/paiktes/${e.player.slug}` : undefined,
      note,
      score: isGoal(e.kind) && e.score ? e.score.replace(/\s*[-–]\s*/, " - ") : undefined,
      half: halfOf(e.minute),
    });
  }
  return out;
}

/** The live log as moments. The half follows the log's own markers too, so a
 *  goal typed without a minute still lands in the right block; the running
 *  score is counted here, the way the board counts it. */
export function feedMoments(feed: MatchFeed, homeTeamId: number): Moment[] {
  const out: Moment[] = [];
  let half: 1 | 2 = 1;
  let h = 0;
  let a = 0;
  for (const e of feed.events) {
    if (e.kind === "halftime" || e.kind === "second_half" || halfOf(e.minute) === 2) half = 2;
    const kind = KINDS[e.kind];
    if (!kind || !e.team) continue;
    const ownSide = e.team.id === homeTeamId;
    const home = e.kind === "own_goal" ? !ownSide : ownSide;
    if (isGoal(e.kind)) {
      if (home) h += 1;
      else a += 1;
    }
    out.push({
      minute: e.minute ?? null,
      home,
      kind,
      name: e.player_name ?? MOMENT_LABELS[kind],
      note: [NOTES[e.kind], e.note].filter(Boolean).join(" · ") || undefined,
      score: isGoal(e.kind) ? `${h} - ${a}` : undefined,
      half,
    });
  }
  return out;
}
