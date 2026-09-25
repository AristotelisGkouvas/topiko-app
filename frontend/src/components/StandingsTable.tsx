"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Crest } from "./Crest";
import { useFavourite, useHydrated } from "@/lib/favourite";
import { formatGoalDifference, listName, zoneLabel } from "@/lib/format";
import type { League, Standing, StandingZone } from "@/lib/types";
import styles from "./StandingsTable.module.css";
import { FormGuide } from "@/components/FormGuide";

type SortKey = "position" | "played" | "goal_difference" | "points";

const SORTABLE: Record<Exclude<SortKey, "position">, string> = {
  played: "Ταξινόμηση κατά αγώνες",
  goal_difference: "Ταξινόμηση κατά διαφορά τερμάτων",
  points: "Ταξινόμηση κατά βαθμούς",
};

/** Zones are rendered as a coloured rail on the row, so the legend below the
 *  table is what actually names them. */
const ZONE_ORDER: StandingZone[] = [
  "promotion",
  "promotion_playoff",
  "relegation_playoff",
  "relegation",
];

function zoneRange(positions: number[] | undefined): string {
  if (!positions?.length) return "";
  const sorted = [...positions].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? `(${first})` : `(${first}–${last})`;
}

export function StandingsTable({
  standings,
  league,
}: {
  standings: Standing[];
  league: Pick<League, "zones">;
}) {
  const [sort, setSort] = useState<SortKey>("position");
  // The reader's own clubs stand out, as they do in the home page's preview:
  // in a table of sixteen the first thing anyone does is look for theirs.
  const { following } = useFavourite();
  const hydrated = useHydrated();

  const rows = useMemo(() => {
    if (sort === "position") return standings;
    // Descending for every stat column — nobody sorts a table to see who has
    // the fewest points first.
    return [...standings].sort((a, b) => b[sort] - a[sort]);
  }, [standings, sort]);

  const toggle = (key: Exclude<SortKey, "position">) =>
    setSort((current) => (current === key ? "position" : key));

  const activeZones = ZONE_ORDER.filter((z) => league.zones?.[z]?.length);

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className="srOnly">
            Βαθμολογία. Οι στήλες αγώνες, διαφορά τερμάτων και βαθμοί
            ταξινομούνται με κλικ.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.posCol}>
                #
              </th>
              <th scope="col" className={styles.teamCol}>
                ΟΜΑΔΑ
              </th>
              <th
                scope="col"
                className={styles.num}
                aria-sort={sort === "played" ? "descending" : "none"}
              >
                <SortButton
                  active={sort === "played"}
                  onClick={() => toggle("played")}
                  title={SORTABLE.played}
                >
                  <abbr title="Αγώνες">ΑΓ.</abbr>
                </SortButton>
              </th>
                                <th scope="col" className={`${styles.num} ${styles.wide}`}>
                    Ν
                  </th>
                  <th scope="col" className={`${styles.num} ${styles.wide}`}>
                    Ι
                  </th>
                  <th scope="col" className={`${styles.num} ${styles.wide}`}>
                    Η
                  </th>
                  <th scope="col" className={`${styles.num} ${styles.wide}`}>
                    ΓΚΟΛ
                  </th>
              <th
                scope="col"
                className={styles.num}
                aria-sort={sort === "goal_difference" ? "descending" : "none"}
              >
                  <SortButton
                    active={sort === "goal_difference"}
                    onClick={() => toggle("goal_difference")}
                    title={SORTABLE.goal_difference}
                  >
                    <abbr title="Διαφορά τερμάτων">ΔΤ</abbr>
                  </SortButton>
                </th>
              <th scope="col" className={`${styles.num} ${styles.formCol}`}>
                ΦΟΡΜΑ
              </th>
              <th
                scope="col"
                className={`${styles.num} ${styles.pointsCol}`}
                aria-sort={sort === "points" ? "descending" : "none"}
              >
                <SortButton
                  active={sort === "points"}
                  onClick={() => toggle("points")}
                  title={SORTABLE.points}
                >
                  <abbr title="Βαθμοί">Β</abbr>
                </SortButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.team.id}
                className={[
                  row.zone ? styles[`zone_${row.zone}`] : "",
                  hydrated && following(row.team.slug) ? styles.mine : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined}
              >
                <td className={styles.posCol}>{row.position}</td>
                <td className={styles.teamCol}>
                  <Link
                    href={`/somateia/${row.team.slug}`}
                    className={styles.teamLink}
                  >
                    <Crest team={row.team} size="xs" />
                    <span className={styles.teamName}>{listName(row.team)}</span>
                  </Link>
                </td>
                <td className={styles.num}>{row.played}</td>
                                    <td className={`${styles.num} ${styles.wide}`}>{row.won}</td>
                    <td className={`${styles.num} ${styles.wide}`}>
                      {row.drawn}
                    </td>
                    <td className={`${styles.num} ${styles.wide}`}>
                      {row.lost}
                    </td>
                    <td className={`${styles.num} ${styles.wide}`}>
                      {row.goals_for}–{row.goals_against}
                      <span className="srOnly"> γκολ υπέρ – κατά</span>
                    </td>
                <td className={styles.num}>
                    {formatGoalDifference(row.goal_difference)}
                  </td>
                <td className={`${styles.num} ${styles.formCol}`}>
                  {row.form ? <FormGuide form={row.form} /> : "—"}
                </td>
                <td className={`${styles.num} ${styles.pointsCol}`}>
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The abbreviations spelled out once. A title attribute helps a mouse;
          a phone has no hover, and this is where most tables are read. */}
      <p className={styles.key}>
        ΑΓ. αγώνες · ΔΤ διαφορά τερμάτων · Β βαθμοί · ΦΟΡΜΑ οι τελευταίοι
        αγώνες (<FormGuide form="Ν" /> νίκη,{" "}
        <FormGuide form="Ι" /> ισοπαλία, <FormGuide form="Η" /> ήττα)
        <br />
        {/* Mirrors backend/app/services/standings.py — change both together. */}
        Σε ισοβαθμία: πρώτα οι βαθμοί στα μεταξύ τους παιχνίδια, μετά η
        διαφορά τερμάτων, μετά τα γκολ υπέρ. Οι βαθμοί είναι μετά από τυχόν
        αφαίρεση.
      </p>

      {activeZones.length > 0 && (
        <ul className={styles.legend}>
          {activeZones.map((zone) => (
            <li key={zone} className={styles.legendItem}>
              <span
                className={`${styles.legendSwatch} ${styles[`swatch_${zone}`]}`}
                aria-hidden="true"
              />
              {zoneLabel(zone)} {zoneRange(league.zones?.[zone])}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SortButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`${styles.sortButton} ${active ? styles.sortActive : ""}`}
    >
      {children}
    </button>
  );
}
