"use client";

import Link from "next/link";

import { Crest } from "@/components/Crest";
import { useFavourite, useHydrated } from "@/lib/favourite";
import { formatGoalDifference, listName } from "@/lib/format";
import type { League, Standing } from "@/lib/types";
import styles from "./MiniStandings.module.css";
import { FormGuide } from "@/components/FormGuide";

/** The home page's table preview.
 *
 *  Five rows, plus the reader's own club wherever it is. That last part is the
 *  whole point of the block: somebody following a club in eleventh place is
 *  shown the top five and then, after a gap, their own row — because "where are
 *  we" is the question they opened the page with, and a leaderboard that never
 *  includes them answers somebody else's.
 *
 *  Client-side because the answer lives in this browser. The rows are all
 *  passed in, already rendered by the server; this only chooses which to show.
 */
const TOP = 5;

export function MiniStandings({
  standings,
  league,
}: {
  standings: Standing[];
  league: League;
}) {
  const { favourite } = useFavourite();
  const hydrated = useHydrated();

  const top = standings.slice(0, TOP);
  const mine =
    hydrated && favourite
      ? standings.find((row) => row.team.slug === favourite.slug)
      : undefined;
  // Only when it is not already up there — otherwise the club appears twice.
  const extra = mine && !top.includes(mine) ? mine : undefined;

  if (standings.length === 0) return null;

  return (
    <div className={styles.card}>
      {/* The column heads are for the eye; each row below is read out whole. */}
      <div className={styles.head} aria-hidden="true">
        <span className={styles.headPos}>#</span>
        <span>ΟΜΑΔΑ</span>
        <span className={styles.headNum}>ΔΤ</span>
        <span className={styles.headForm}>ΦΟΡΜΑ</span>
        <span className={styles.headNum}>Β</span>
      </div>

      <ol className={styles.list} aria-label="Κορυφή βαθμολογίας">
        {top.map((row) => (
          <li key={row.team.id}>
            <Row row={row} mine={row === mine} />
          </li>
        ))}

        {extra && (
          <>
            {/* A gap, not a continuation: the rows between are missing, and a
                flush join would read as sixth place. */}
            <li className={styles.gap} aria-hidden="true">
              ⋯
            </li>
            <li>
              <Row row={extra} mine />
            </li>
          </>
        )}
      </ol>

      <Link href={`/vathmologia?liga=${league.slug}`} className={styles.all}>
        Πλήρης βαθμολογία ›
      </Link>
    </div>
  );
}

const RESULT = { Ν: "νίκη", Ι: "ισοπαλία", Η: "ήττα" } as Record<string, string>;

function Row({ row, mine }: { row: Standing; mine: boolean }) {
  const form = (row.form ?? "").split("").slice(-3);
  // The dots are colour alone; the label says the results in words.
  const spoken = [
    `${row.position}. ${listName(row.team)}`,
    `${row.points} βαθμοί`,
    `διαφορά ${formatGoalDifference(row.goal_difference)}`,
    form.length ? `φόρμα: ${form.map((r) => RESULT[r] ?? r).join(", ")}` : null,
    mine ? "η ομάδα σου" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Link
      href={`/somateia/${row.team.slug}`}
      className={`${styles.row} ${mine ? styles.rowMine : ""}`}
      aria-label={spoken}
    >
      <span className={styles.pos}>{row.position}</span>
      <span className={styles.team}>
        <Crest team={row.team} size="xs" />
        <span className={styles.name}>{listName(row.team)}</span>
      </span>
      <span className={styles.num}>
        {formatGoalDifference(row.goal_difference)}
      </span>
      <span className={styles.form}>
        <FormGuide form={form} />
      </span>
      <span className={styles.points}>{row.points}</span>
    </Link>
  );
}
