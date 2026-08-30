"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { League } from "@/lib/types";
import styles from "./LeagueTabs.module.css";

/** Horizontal league switcher ("Α΄ Κατηγορία / Β΄ Κατηγορία / Κύπελλο").
 *
 *  The selection lives in the URL as ?liga=, so a link to a particular
 *  category can be shared and the back button behaves.
 */
export function LeagueTabs({
  leagues,
  active,
}: {
  leagues: League[];
  active: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (leagues.length < 2) return null;

  const hrefFor = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("liga", slug);
    // Switching category resets the matchday: the 14th of one league has
    // nothing to do with the 14th of another.
    params.delete("agonistiki");
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className={styles.scroll}>
      <div className={styles.tabs} role="tablist" aria-label="Διοργάνωση">
        {leagues.map((league) => (
          <Link
            key={league.slug}
            href={hrefFor(league.slug)}
            role="tab"
            aria-selected={league.slug === active}
            className={`${styles.tab} ${
              league.slug === active ? styles.active : ""
            }`}
            scroll={false}
          >
            {league.short_name ?? league.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
