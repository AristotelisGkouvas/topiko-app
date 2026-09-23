"use client";

import Link from "next/link";

import { Crest } from "@/components/Crest";
import { useFavourite, useHydrated } from "@/lib/favourite";
import type { CrestSubject } from "@/lib/types";
import styles from "./page.module.css";

export interface PickableClub extends CrestSubject {
  slug: string;
}

/** Step two: pick the club you care about.
 *
 *  Picking writes straight to the same store the star on every club page
 *  writes to — there is no separate "onboarding choice" to reconcile later.
 *  Pressing an already-chosen club unpicks it, because the alternative is a
 *  reader stuck with a mistap and no way back.
 */
export function ClubPicker({ teams }: { teams: PickableClub[] }) {
  const { favourite, toggle } = useFavourite();
  const hydrated = useHydrated();

  return (
    <>
      <ul className={styles.clubs}>
        {teams.map((team) => {
          const chosen = hydrated && favourite?.slug === team.slug;
          return (
            <li key={team.slug}>
              <button
                type="button"
                className={`${styles.club} ${chosen ? styles.clubChosen : ""}`}
                aria-pressed={chosen}
                onClick={() => toggle({ slug: team.slug, name: team.name })}
              >
                <Crest team={team} size="sm" />
                <span className={styles.clubName}>{team.name}</span>
                <span className={styles.tick} aria-hidden="true">
                  {chosen ? "✓" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.actions}>
        <Link
          href="/kalosorisma?vima=3"
          className={favourite ? styles.primary : styles.secondary}
        >
          {/* The step is skippable: somebody who follows no single club is a
              perfectly ordinary reader of a federation's results. */}
          {favourite ? `Συνέχεια με ${favourite.name}` : "Προσπέρασέ το"}
        </Link>
      </div>
    </>
  );
}
