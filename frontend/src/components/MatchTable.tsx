import Link from "next/link";

import { ClubName } from "@/components/ClubName";
import { Crest } from "@/components/Crest";
import type { Standing } from "@/lib/types";
import styles from "./MatchTable.module.css";

/** The ΒΑΘΜΟΛΟΓΙΑ tab (screen 03 v2): the division's table, compact — place,
 *  club, played, goal difference, points — with the two sides of this match
 *  picked out. */
export function MatchTable({
  rows,
  teamIds,
  leagueSlug,
}: {
  rows: Standing[];
  teamIds: number[];
  leagueSlug: string;
}) {
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" title="Θέση">#</th>
            <th scope="col">ΟΜΑΔΑ</th>
            <th scope="col" title="Αγώνες">ΑΓ</th>
            <th scope="col" title="Διαφορά τερμάτων">ΔΤ</th>
            <th scope="col" title="Βαθμοί">Β</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team.id} className={teamIds.includes(r.team.id) ? styles.mine : undefined}>
              <td className={styles.pos}>{r.position}</td>
              <th scope="row">
                <Link href={`/somateia/${r.team.slug}`} className={styles.club}>
                  <Crest team={r.team} size="xs" />
                  <span>
                    <ClubName name={r.team.name} />
                  </span>
                </Link>
              </th>
              <td>{r.played}</td>
              <td>{r.goal_difference > 0 ? `+${r.goal_difference}` : r.goal_difference < 0 ? `−${-r.goal_difference}` : "0"}</td>
              <td className={styles.pts}>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.foot}>
        <Link href={`/vathmologia?liga=${leagueSlug}`}>Πλήρης βαθμολογία ›</Link>
      </p>
    </>
  );
}
