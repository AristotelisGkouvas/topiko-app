"use client";

import Link from "next/link";
import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import type { components } from "@/lib/api-schema";
import styles from "./page.module.css";

type LiveScorer = components["schemas"]["LiveScorerOut"];

/** Goals logged at the ground, per named player — beside the official table,
 *  never merged into it.
 *
 *  The federation publishes its list days later and only the head of it; this
 *  is what volunteers recorded on Sunday. Hidden when there is nothing, which
 *  is most divisions until clubs start naming scorers on the sheet.
 */
export function LiveScorers({ leagueSlug }: { leagueSlug: string }) {
  const { data } = useSWR<LiveScorer[]>(
    apiUrl(`/leagues/${leagueSlug}/scorers/live`),
    jsonFetcher,
  );
  if (!data?.length) return null;

  return (
    <section className={styles.tableWrap} aria-labelledby="live-scorers">
      <table className={styles.table}>
        <caption id="live-scorers" className={styles.caption}>
          Από τα γήπεδα (ανεπίσημα) — γκολ που καταχώρησαν τα σωματεία κατά
          τη διάρκεια των αγώνων, με όνομα παίκτη.
        </caption>
        <thead>
          <tr>
            <th scope="col">Παίκτης</th>
            <th scope="col" className={styles.num}>
              <abbr title="Γκολ">Γ</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={`${row.player.id}-${row.team?.id ?? 0}`}>
              <td>
                <div className={styles.names}>
                  <Link href={`/paiktes/${row.player.slug}`} className={styles.playerName}>
                    {row.player.name}
                  </Link>
                  {row.team && (
                    <Link href={`/somateia/${row.team.slug}`} className={styles.teamName}>
                      {row.team.name}
                    </Link>
                  )}
                </div>
              </td>
              <td className={`${styles.num} ${styles.goals}`}>{row.goals}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
