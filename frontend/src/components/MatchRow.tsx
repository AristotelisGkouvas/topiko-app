import Link from "next/link";

import { formatTime, listName, matchStatusLabel } from "@/lib/format";
import type { Match } from "@/lib/types";
import styles from "./MatchRow.module.css";

/** One match in a list, as the design draws it: two lines, one per club.
 *
 *  Not "Α — Β  15:30" on a single line. Two lines cost one row of height and
 *  buy the thing a results list is for — running an eye down the left edge and
 *  finding your club — which a dash-separated pair does not allow, because half
 *  the clubs are on the right of the dash.
 *
 *  The winner is set in 800 navy and the loser in 600 muted. That, rather than
 *  reading the two numbers, is what makes a column of fourteen results legible
 *  at a glance.
 */
export function MatchRow({ match, last = false }: { match: Match; last?: boolean }) {
  const played = match.home_score !== null && match.away_score !== null;
  const homeWon = played && match.home_score! > match.away_score!;
  const awayWon = played && match.away_score! > match.home_score!;

  return (
    <Link
      href={`/agones/${match.id}`}
      className={`${styles.row} ${last ? styles.rowLast : ""}`}
    >
      <Side
        team={match.home_team}
        score={match.home_score}
        won={homeWon}
        lost={played && awayWon}
      />
      <Side
        team={match.away_team}
        score={match.away_score}
        won={awayWon}
        lost={played && homeWon}
      />

      {/* Kickoff time for a fixture, status for anything that is not simply
          "played" or "to be played" — an abandoned match with a score on the
          board is the one a reader most needs told about. */}
      {!played && (
        <span className={styles.time}>
          {match.status === "scheduled"
            ? formatTime(match.kickoff_at)
            : matchStatusLabel(match.status, match.kickoff_at)}
        </span>
      )}
      {match.is_live && <span className={styles.live}>LIVE</span>}
    </Link>
  );
}

function Side({
  team,
  score,
  won,
  lost,
}: {
  team: Match["home_team"];
  score: number | null;
  won: boolean;
  lost: boolean;
}) {
  return (
    <span
      className={`${styles.side} ${won ? styles.won : ""} ${lost ? styles.lost : ""}`}
    >
      <span className={styles.crest} aria-hidden="true">
        {team.initials ?? team.name.slice(0, 2)}
      </span>
      <span className={styles.name}>{listName(team)}</span>
      {score !== null && <span className={styles.score}>{score}</span>}
    </span>
  );
}
