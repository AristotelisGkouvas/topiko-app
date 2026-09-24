import Link from "next/link";

import { leagueLabel } from "@/lib/leagues";
import type { League } from "@/lib/types";
import styles from "./LeagueChips.module.css";

/** The division chips across the top of a list page.
 *
 *  The same chip shape the search tabs use — navy when chosen, white with a
 *  grey border when not — because they do the same job and there is no reason
 *  for a reader to learn two.
 *
 *  Scrolls rather than wraps: with seventeen divisions, wrapping produces four
 *  lines of chips above the content on a phone.
 */
export function LeagueChips({
  leagues,
  active,
  basePath,
}: {
  leagues: League[];
  active: string;
  basePath: string;
}) {
  if (leagues.length < 2) return null;

  return (
    <nav className={styles.chips} aria-label="Κατηγορία">
      {leagues.map((league) => (
        <Link
          key={league.slug}
          href={`${basePath}?liga=${league.slug}`}
          className={`${styles.chip} ${
            league.slug === active ? styles.chipOn : ""
          }`}
          aria-current={league.slug === active ? "page" : undefined}
        >
          {leagueLabel(league)}
        </Link>
      ))}
    </nav>
  );
}
