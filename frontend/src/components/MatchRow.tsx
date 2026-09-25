"use client";

import Link from "next/link";

import { Crest } from "@/components/Crest";
import { useFavourite, useHydrated } from "@/lib/favourite";

import { formatDayDate, formatTime, isDecided, listName, matchStatusLabel } from "@/lib/format";
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
 *
 *  `showDate` is for lists that span weeks — a club's fixtures, a volunteer's
 *  matches — where "16:00" alone does not say which Sunday. It adds a third
 *  line with the day and the ground.
 */
export function MatchRow({
  match,
  last = false,
  showDate = false,
}: {
  match: Match;
  last?: boolean;
  showDate?: boolean;
}) {
  // The reader's own club stands out in every list, not just the home page.
  const { following } = useFavourite();
  const hydrated = useHydrated();
  const mine =
    hydrated && (following(match.home_team.slug) || following(match.away_team.slug));

  const played = isDecided(match);
  const homeWon = played && match.home_score! > match.away_score!;
  const awayWon = played && match.away_score! > match.home_score!;

  return (
    <Link
      href={`/agones/${match.id}`}
      className={`${styles.row} ${last ? styles.rowLast : ""} ${match.is_live ? styles.rowLive : ""} ${mine ? styles.rowMine : ""}`}
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
          {(() => {
            // A kickoff that has passed with no score says so, rather than
            // showing "21:00" as if it were still to come.
            const state = matchStatusLabel(match.status, match.kickoff_at);
            return match.status === "scheduled" && state !== "ΧΩΡΙΣ ΑΠΟΤΕΛΕΣΜΑ"
              ? formatTime(match.kickoff_at)
              : state;
          })()}
        </span>
      )}
      {showDate && (
        <span className={styles.meta}>
          {[
            match.kickoff_at
              ? `${formatDayDate(match.kickoff_at)} · ${formatTime(match.kickoff_at)}`
              : "Χωρίς ημερομηνία",
            match.field?.short_name ?? match.field?.name,
          ]
            .filter(Boolean)
            .join(" · ")}
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
      <Crest team={team} size="xs" />
      <span className={styles.name}>{listName(team)}</span>
      {score !== null && <span className={styles.score}>{score}</span>}
    </span>
  );
}
