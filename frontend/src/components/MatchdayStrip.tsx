import Link from "next/link";

import styles from "./MatchdayStrip.module.css";

/** The 1–26 strip from screen D02.
 *
 *  Wide screens only. On a phone the stepper in the header is the control, and
 *  twenty-six numbers across 360px are 13px apart — under any thumb.
 *
 *  The round the league is actually on is marked, so "where are we" does not
 *  require counting: a reader looking at the 4th round can see at a glance that
 *  the 9th is the live one.
 */
export function MatchdayStrip({
  total,
  active,
  current,
  href,
}: {
  total: number;
  active: number;
  current: number | null;
  href: (n: number) => string;
}) {
  return (
    <nav className={styles.strip} aria-label="Αγωνιστική">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <Link
          key={n}
          href={href(n)}
          className={`${styles.day} ${n === active ? styles.dayOn : ""} ${
            n === current ? styles.dayNow : ""
          }`}
          aria-current={n === active ? "page" : undefined}
          aria-label={`${n}η αγωνιστική${n === current ? " — τρέχουσα" : ""}`}
        >
          {n}
        </Link>
      ))}
    </nav>
  );
}
