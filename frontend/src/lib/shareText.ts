import { formatDayDate, formatTime, listName } from "./format";
import type { Match, Standing } from "./types";

/** Plain-text versions of a round and a table, for pasting into a group chat.
 *
 *  One line per match, the way people already type them by hand:
 *  "Μετσόβου – Ζίτσας 2-0", or the day and time for one still to be played.
 */
export function roundText(title: string, matches: Match[]): string {
  const lines = matches.map((m) => {
    const pair = `${listName(m.home_team)} – ${listName(m.away_team)}`;
    if (m.home_score !== null && m.away_score !== null) {
      return `${pair} ${m.home_score}-${m.away_score}${m.is_live ? " (LIVE)" : ""}`;
    }
    if (m.status === "postponed") return `${pair} — αναβολή`;
    if (m.status === "cancelled") return `${pair} — ματαίωση`;
    const when = [formatDayDate(m.kickoff_at), formatTime(m.kickoff_at)]
      .filter(Boolean)
      .join(" ");
    return when ? `${pair}, ${when}` : pair;
  });
  return [title, "", ...lines].join("\n");
}

export function tableText(title: string, standings: Standing[]): string {
  const lines = standings.map(
    (row) =>
      `${row.position}. ${listName(row.team)} ${row.points}β (${row.played} αγ., ${row.goals_for}-${row.goals_against})`,
  );
  return [title, "", ...lines].join("\n");
}
