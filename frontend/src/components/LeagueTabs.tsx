"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { League } from "@/lib/types";
import styles from "./LeagueTabs.module.css";

/** Horizontal league switcher ("Α΄ Κατηγορία / Β΄ Κατηγορία / Κύπελλο").
 *
 *  The selection lives in the URL as ?liga=, so a link to a particular
 *  category can be shared and the back button behaves.
 *
 *  Academy competitions are folded away behind a toggle. A season here runs
 *  three open-age divisions and fourteen youth ones, and listing all seventeen
 *  as equals buries the ones almost everybody came for.
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

  const senior = leagues.filter((l) => !l.age_group);
  const youth = leagues.filter((l) => l.age_group);
  const activeIsYouth = youth.some((l) => l.slug === active);
  const [showYouth, setShowYouth] = useState(activeIsYouth);

  if (leagues.length < 2) return null;

  const hrefFor = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("liga", slug);
    // Switching category resets the matchday: the 14th of one league has
    // nothing to do with the 14th of another.
    params.delete("agonistiki");
    return `${pathname}?${params.toString()}`;
  };

  const tab = (league: League) => (
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
  );

  const shown = showYouth ? [...senior, ...youth] : senior;

  return (
    <div className={styles.scroll}>
      <div className={styles.tabs} role="tablist" aria-label="Διοργάνωση">
        {shown.map(tab)}
        {youth.length > 0 && (
          <button
            type="button"
            className={`${styles.tab} ${styles.toggle}`}
            aria-expanded={showYouth}
            onClick={() => setShowYouth((v) => !v)}
          >
            {showYouth ? "− Υποδομές" : `+ Υποδομές (${youth.length})`}
          </button>
        )}
      </div>
    </div>
  );
}
