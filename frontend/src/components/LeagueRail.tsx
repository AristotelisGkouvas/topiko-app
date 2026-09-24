import Link from "next/link";

import { InstallCard } from "./InstallCard";
import { leagueLabel } from "@/lib/leagues";
import type { League } from "@/lib/types";
import styles from "./LeagueRail.module.css";

/** The desktop home page's left column: which division you are looking at.
 *
 *  A rail rather than the tab strip the phone uses. With seventeen divisions
 *  the strip scrolls horizontally, which works under a thumb and not at all
 *  under a mouse — and on a 1200px screen there is a column of width sitting
 *  empty beside the content anyway.
 *
 *  Hidden below the desktop breakpoint, where the header's chip does this job.
 */
export function LeagueRail({
  leagues,
  active,
  matchday,
  totalMatchdays,
}: {
  leagues: League[];
  active: string;
  matchday: number | null;
  totalMatchdays: number | null;
}) {
  return (
    <aside className={styles.rail} aria-label="Κατηγορία">
      <p className={styles.label}>ΚΑΤΗΓΟΡΙΕΣ</p>
      <nav className={styles.list}>
        {leagues.map((league) => (
          <Link
            key={league.slug}
            href={`/?liga=${league.slug}`}
            className={`${styles.item} ${
              league.slug === active ? styles.itemOn : ""
            }`}
            aria-current={league.slug === active ? "page" : undefined}
          >
            {leagueLabel(league)}
          </Link>
        ))}
      </nav>

      {matchday !== null && (
        <>
          <p className={styles.label}>ΑΓΩΝΙΣΤΙΚΗ</p>
          <p className={styles.matchday}>
            {matchday}η{totalMatchdays ? ` από ${totalMatchdays}` : ""}
          </p>
        </>
      )}

      <InstallCard />
    </aside>
  );
}
