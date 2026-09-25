import Link from "next/link";

import { Crest } from "@/components/Crest";
import { SectionHeader } from "@/components/SectionHeader";
import { formatGoalDifference } from "@/lib/format";
import type { ComparedSide, Comparison } from "@/lib/types";
import styles from "./page.module.css";

/** Rows where a higher number is the better one.
 *
 *  Goals conceded is the exception, and getting it backwards would quietly
 *  praise the worse defence — so the direction is stated per row rather than
 *  assumed from the shape of the data.
 */
const ROWS: {
  label: string;
  value: (side: ComparedSide) => string | number;
  better?: "high" | "low";
  compare?: (side: ComparedSide) => number;
}[] = [
  {
    label: "Θέση",
    value: (s) => s.position ?? "—",
    better: "low",
    // A club with no table row must not win the comparison by default.
    compare: (s) => s.position ?? 999,
  },
  { label: "Αγώνες", value: (s) => s.played },
  { label: "Βαθμοί", value: (s) => s.points, better: "high", compare: (s) => s.points },
  { label: "Ν-Ι-Η", value: (s) => `${s.won}-${s.drawn}-${s.lost}` },
  {
    label: "Γκολ υπέρ",
    value: (s) => s.goals_for,
    better: "high",
    compare: (s) => s.goals_for,
  },
  {
    label: "Γκολ κατά",
    value: (s) => s.goals_against,
    better: "low",
    compare: (s) => s.goals_against,
  },
  {
    label: "Διαφορά",
    value: (s) => formatGoalDifference(s.goal_difference),
    better: "high",
    compare: (s) => s.goal_difference,
  },
  { label: "Φόρμα", value: (s) => s.form ?? "—" },
];

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
          let lead: "left" | "right" | null = null;
          if (row.compare && row.better) {
            const a = row.compare(left);
            const b = row.compare(right);
            if (a !== b) {
              lead = (row.better === "high" ? a > b : a < b) ? "left" : "right";
            }
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
