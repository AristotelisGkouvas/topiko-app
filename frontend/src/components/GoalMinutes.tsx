"use client";

import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import type { components } from "@/lib/api-schema";
import { SectionHeader } from "./SectionHeader";
import styles from "./GoalMinutes.module.css";

type Minutes = components["schemas"]["GoalMinutesOut"];

const BANDS = ["1–15", "16–30", "31–45", "46–60", "61–75", "76–90"];

/** When a club scores and concedes, in six 15-minute bands — from the goals
 *  volunteers logged with a minute. Hidden until there are any. */
export function GoalMinutes({ slug, title }: { slug: string; title?: string }) {
  const { data } = useSWR<Minutes>(apiUrl(`/teams/${slug}/goal-minutes`), jsonFetcher, {
    revalidateOnFocus: false,
  });
  if (!data || data.matches === 0) return null;
  const top = Math.max(1, ...data.scored, ...data.conceded);

  return (
    <>
    {/* The heading lives here so it disappears with the table. */}
    {title && <SectionHeader title={title} />}
    <div className={styles.card}>
      <table className={styles.table}>
        <caption className={styles.caption}>
          Γκολ ανά 15λεπτο, από {data.matches}{" "}
          {data.matches === 1 ? "αγώνα" : "αγώνες"} με φύλλο αγώνα
        </caption>
        <thead>
          <tr>
            <th scope="col">Λεπτά</th>
            <th scope="col">Υπέρ</th>
            <th scope="col">Κατά</th>
          </tr>
        </thead>
        <tbody>
          {BANDS.map((band, i) => (
            <tr key={band}>
              <th scope="row">{band}</th>
              <td>
                <span className={styles.bar} style={{ width: `${(data.scored[i] / top) * 100}%` }} aria-hidden="true" />
                {data.scored[i]}
              </td>
              <td>
                <span
                  className={`${styles.bar} ${styles.against}`}
                  style={{ width: `${(data.conceded[i] / top) * 100}%` }}
                  aria-hidden="true"
                />
                {data.conceded[i]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
