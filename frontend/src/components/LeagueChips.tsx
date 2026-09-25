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
  withAll = false,
  season,
}: {
  leagues: League[];
  active: string;
  basePath: string;
  /** The season on show, when it is not the current one. Carried into every
   *  chip, or picking a division jumped back to this season's table. */
  season?: string;
  /** An "Όλες" chip first, for pages that can show every division at once. */
  withAll?: boolean;
}) {
  if (leagues.length < 2) return null;

  const href = (liga: string) =>
    `${basePath}?liga=${liga}${season ? `&periodos=${encodeURIComponent(season)}` : ""}`;

  return (
    <nav className={styles.chips} aria-label="Κατηγορία">
      {withAll && (
        <Link
          href={href("oles")}
          className={`${styles.chip} ${active === "oles" ? styles.chipOn : ""}`}
          aria-current={active === "oles" ? "page" : undefined}
        >
          Όλες
        </Link>
      )}
      {leagues.map((league) => (
        <Link
          key={league.slug}
          href={href(league.slug)}
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
