"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { matchdayLabel } from "@/lib/format";
import styles from "./MatchdayPicker.module.css";

/** Previous / next stepper over αγωνιστικές, kept in the URL as ?agonistiki=. */
export function MatchdayPicker({
  current,
  total,
}: {
  current: number;
  total: number | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (matchday: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("agonistiki", String(matchday));
    return `${pathname}?${params.toString()}`;
  };

  const hasPrev = current > 1;
  const hasNext = total === null || current < total;

  return (
    <div className={styles.row}>
      {hasPrev ? (
        <Link
          href={hrefFor(current - 1)}
          className={styles.button}
          aria-label="Προηγούμενη αγωνιστική"
          scroll={false}
        >
          ‹
        </Link>
      ) : (
        <span className={styles.button} aria-hidden="true" data-disabled>
          ‹
        </span>
      )}

      <span className={styles.label}>{matchdayLabel(current)}</span>

      {hasNext ? (
        <Link
          href={hrefFor(current + 1)}
          className={styles.button}
          aria-label="Επόμενη αγωνιστική"
          scroll={false}
        >
          ›
        </Link>
      ) : (
        <span className={styles.button} aria-hidden="true" data-disabled>
          ›
        </span>
      )}

      {total !== null && <span className={styles.total}>από {total}</span>}
    </div>
  );
}
