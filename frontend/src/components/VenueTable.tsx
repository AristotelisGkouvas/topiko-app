import Link from "next/link";

import { listName } from "@/lib/format";
import type { Match } from "@/lib/types";
import styles from "./StandingsTable.module.css";

type Row = {
  team: Match["home_team"];
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
  points: number;
};

/** The table counted from home games only, or away games only.
 *
 *  Built from the season's results rather than stored: it is a view of the
 *  same matches the main table counts. 3 points a win, 1 a draw — the
 *  federation's rule for every division it runs; deductions are not applied
 *  here, since they belong to the club's season rather than to a venue. */
export function VenueTable({ matches, side }: { matches: Match[]; side: "home" | "away" }) {
  const rows = new Map<number, Row>();
  for (const m of matches) {
    if (m.home_score === null || m.away_score === null) continue;
    if (m.status !== "finished" && m.status !== "awarded") continue;
    const team = side === "home" ? m.home_team : m.away_team;
    const us = side === "home" ? m.home_score : m.away_score;
    const them = side === "home" ? m.away_score : m.home_score;
    const row =
      rows.get(team.id) ??
      { team, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, points: 0 };
    row.played += 1;
    row.scored += us;
    row.conceded += them;
    if (us > them) {
      row.won += 1;
      row.points += 3;
    } else if (us === them) {
      row.drawn += 1;
      row.points += 1;
    } else {
      row.lost += 1;
    }
    rows.set(team.id, row);
  }
  const ordered = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.scored - b.conceded - (a.scored - a.conceded) ||
      b.scored - a.scored ||
      listName(a.team).localeCompare(listName(b.team), "el"),
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className="srOnly">
            Βαθμολογία μόνο από τους αγώνες {side === "home" ? "εντός" : "εκτός"} έδρας
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.posCol}>#</th>
              <th scope="col" className={styles.teamCol}>ΟΜΑΔΑ</th>
              <th scope="col" className={styles.num}><abbr title="Αγώνες">ΑΓ.</abbr></th>
              <th scope="col" className={styles.num}><abbr title="Νίκες">Ν</abbr></th>
              <th scope="col" className={styles.num}><abbr title="Ισοπαλίες">Ι</abbr></th>
              <th scope="col" className={styles.num}><abbr title="Ήττες">Η</abbr></th>
              <th scope="col" className={styles.num}>ΓΚΟΛ</th>
              <th scope="col" className={`${styles.num} ${styles.pointsCol}`}><abbr title="Βαθμοί">Β</abbr></th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row, i) => (
              <tr key={row.team.id}>
                <td className={styles.posCol}>{i + 1}</td>
                <td className={styles.teamCol}>
                  <Link href={`/somateia/${row.team.slug}`} className={styles.teamLink}>
                    <span className={styles.teamName}>{listName(row.team)}</span>
                  </Link>
                </td>
                <td className={styles.num}>{row.played}</td>
                <td className={styles.num}>{row.won}</td>
                <td className={styles.num}>{row.drawn}</td>
                <td className={styles.num}>{row.lost}</td>
                <td className={styles.num}>
                  {row.scored}–{row.conceded}
                  <span className="srOnly"> γκολ υπέρ – κατά</span>
                </td>
                <td className={`${styles.num} ${styles.pointsCol}`}>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
