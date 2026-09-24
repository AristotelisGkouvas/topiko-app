import { listName } from "@/lib/format";
import type { Match, TeamRef } from "@/lib/types";
import styles from "./HeadToHeadBar.module.css";

export interface Record {
  home: number;
  draws: number;
  away: number;
}

/** Count previous meetings from the point of view of *this* fixture.
 *
 *  The stored matches carry their own home and away, which swap from season to
 *  season — so a win has to be attributed by club id rather than by side, or
 *  half the record lands on the wrong team.
 */
export function tally(meetings: Match[], homeTeamId: number): Record {
  const record: Record = { home: 0, draws: 0, away: 0 };
  for (const match of meetings) {
    if (match.home_score === null || match.away_score === null) continue;
    if (match.home_score === match.away_score) {
      record.draws += 1;
      continue;
    }
    const winnerId =
      match.home_score > match.away_score ? match.home_team.id : match.away_team.id;
    if (winnerId === homeTeamId) record.home += 1;
    else record.away += 1;
  }
  return record;
}

/** The bar from screens 03 and D03: how the two clubs have split their history.
 *
 *  A proportional bar rather than three numbers, because the question is "who
 *  usually wins this" and a bar answers it without arithmetic. The numbers are
 *  printed above it anyway — a bar alone cannot say whether it is summarising
 *  four meetings or forty.
 */
export function HeadToHeadBar({
  home,
  away,
  record,
}: {
  home: TeamRef;
  away: TeamRef;
  record: Record;
}) {
  const total = record.home + record.draws + record.away;
  if (total === 0) return null;

  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        <span className={styles.side}>
          <strong>{record.home}</strong>{" "}
          {record.home === 1 ? "νίκη" : "νίκες"} {listName(home)}
        </span>
        <span className={styles.draws}>
          {record.draws} {record.draws === 1 ? "ισοπαλία" : "ισοπαλίες"}
        </span>
        <span className={styles.side}>
          <strong>{record.away}</strong>{" "}
          {record.away === 1 ? "νίκη" : "νίκες"} {listName(away)}
        </span>
      </div>

      <div
        className={styles.bar}
        role="img"
        aria-label={`${record.home} νίκες ${listName(home)}, ${record.draws} ισοπαλίες, ${record.away} νίκες ${listName(away)} σε ${total} συναντήσεις`}
      >
        <span className={styles.barHome} style={{ width: pct(record.home) }} />
        <span className={styles.barDraw} style={{ width: pct(record.draws) }} />
        <span className={styles.barAway} style={{ width: pct(record.away) }} />
      </div>
    </div>
  );
}
