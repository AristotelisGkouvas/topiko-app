import Link from "next/link";

import { Crest } from "@/components/Crest";
import { SectionHeader } from "@/components/SectionHeader";
import { formatGoalDifference } from "@/lib/format";
import type { ComparedSide, Comparison } from "@/lib/types";
import styles from "./page.module.css";

/** The rows, each with the number its bar is drawn from.
 *
 *  `better` says which way is good. Goals conceded and table position are the
 *  exceptions, and getting them backwards would quietly praise the worse side
 *  — so the direction is stated per row rather than assumed from the data.
 *  Rows without a number (the record, the form) are shown without a bar.
 */
const ROWS: {
  label: string;
  value: (side: ComparedSide) => string | number;
  better?: "high" | "low";
  bar?: (side: ComparedSide) => number | null;
}[] = [
  {
    label: "Θέση",
    value: (s) => (s.position ? `${s.position}η` : "—"),
    better: "low",
    bar: (s) => s.position,
  },
  { label: "Αγώνες", value: (s) => s.played, bar: (s) => s.played },
  { label: "Βαθμοί", value: (s) => s.points, better: "high", bar: (s) => s.points },
  { label: "Νίκες-Ισοπαλίες-Ήττες", value: (s) => `${s.won}-${s.drawn}-${s.lost}` },
  { label: "Γκολ υπέρ", value: (s) => s.goals_for, better: "high", bar: (s) => s.goals_for },
  {
    label: "Γκολ κατά",
    value: (s) => s.goals_against,
    better: "low",
    bar: (s) => s.goals_against,
  },
  {
    label: "Διαφορά τερμάτων",
    value: (s) => formatGoalDifference(s.goal_difference),
    better: "high",
    bar: (s) => s.goal_difference,
  },
  { label: "Φόρμα", value: (s) => s.form ?? "—" },
];

/** How much of its half each side's bar fills, 0–1.
 *
 *  The larger value fills its half and the other is drawn in proportion, as
 *  on the usual match-stats screens. Where lower is better (position, goals
 *  against) the two are swapped first, so the longer bar is always the better
 *  one. Negative values (a goal difference of −3) are shifted up to zero.
 */
function barWidths(
  a: number | null,
  b: number | null,
  better: "high" | "low" | undefined,
): [number, number] | null {
  if (a === null || b === null) return null;
  let [x, y] = better === "low" ? [b, a] : [a, b];
  const floor = Math.min(x, y, 0);
  x -= floor;
  y -= floor;
  const top = Math.max(x, y);
  if (top === 0) return [0, 0];
  return [x / top, y / top];
}

export function ComparisonTable({ comparison }: { comparison: Comparison }) {
  const { left, right, record } = comparison;

  return (
    <>
      <div className={styles.heads}>
        <Side side={left} />
        <span className={styles.season}>{comparison.season}</span>
        <Side side={right} />
      </div>

      <dl className={styles.stats}>
        {ROWS.map((row) => {
          const widths = row.bar ? barWidths(row.bar(left), row.bar(right), row.better) : null;
          let lead: "left" | "right" | null = null;
          if (widths && row.better && widths[0] !== widths[1]) {
            lead = widths[0] > widths[1] ? "left" : "right";
          }
          return (
            <div key={row.label} className={styles.statRow}>
              <dd className={`${styles.cell} ${lead === "left" ? styles.lead : ""}`}>
                {row.value(left)}
              </dd>
              <dt className={styles.statLabel}>{row.label}</dt>
              <dd className={`${styles.cell} ${lead === "right" ? styles.lead : ""}`}>
                {row.value(right)}
              </dd>
              {widths && (
                <div className={styles.bars} aria-hidden="true">
                  <span className={styles.barHalf}>
                    <span
                      className={`${styles.bar} ${styles.barLeft} ${
                        lead === "right" ? styles.barBehind : ""
                      }`}
                      style={{ width: `${widths[0] * 100}%` }}
                    />
                  </span>
                  <span className={styles.barHalf}>
                    <span
                      className={`${styles.bar} ${styles.barRight} ${
                        lead === "left" ? styles.barBehind : ""
                      }`}
                      style={{ width: `${widths[1] * 100}%` }}
                    />
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </dl>

      {/* Only when the two sit in different tables. Saying it every time would
          be noise; leaving it off when it matters lets 3rd look better than
          1st. */}
      {left.league_slug !== right.league_slug && (
        <p className={styles.note}>
          Διαφορετικές διοργανώσεις — {left.league_name ?? "—"} έναντι{" "}
          {right.league_name ?? "—"}. Οι θέσεις δεν συγκρίνονται απευθείας.
        </p>
      )}

      {record && (
        <section className={styles.record}>
          <SectionHeader title="Μεταξύ τους" />
          <p className={styles.recordLine}>
            <strong>{record.played}</strong>{" "}
            {record.played === 1 ? "συνάντηση" : "συναντήσεις"} · {record.home_wins}
            –{record.draws}–{record.away_wins} · γκολ {record.home_goals}–
            {record.away_goals}
          </p>
          <Link
            href={`/kontra/${left.team.slug}/${right.team.slug}`}
            className={styles.recordLink}
          >
            Όλο το ιστορικό →
          </Link>
        </section>
      )}
    </>
  );
}

function Side({ side }: { side: ComparedSide }) {
  return (
    <Link href={`/somateia/${side.team.slug}`} className={styles.side}>
      <Crest team={side.team} size="lg" />
      <span className={styles.sideName}>{side.team.name}</span>
      {side.league_name && (
        <span className={styles.sideLeague}>{side.league_name}</span>
      )}
    </Link>
  );
}
