"use client";

import Link from "next/link";

import { useFavourite, useHydrated } from "@/lib/favourite";
import { upper } from "@/lib/format";
import type { CrestSubject } from "@/lib/types";
import styles from "./page.module.css";

export interface PickableClub extends CrestSubject {
  slug: string;
}

/** Step two: pick the club you care about.
 *
 *  A three-column grid of tiles, as the design draws it — not a list. Clubs are
 *  recognised by a monogram and a short name, both of which fit a tile, and a
 *  grid puts nine on screen where a list puts four. Finding your village is
 *  scanning, not reading.
 *
 *  Picking writes straight to the same store the star on every club page writes
 *  to; there is no separate "onboarding choice" to reconcile later. Pressing an
 *  already-chosen club unpicks it, because the alternative is a reader stuck
 *  with a mistap and no way back.
 */
export function ClubPicker({ teams }: { teams: PickableClub[] }) {
  const { clubs, favourite, toggle } = useFavourite();
  const hydrated = useHydrated();

  return (
    <>
      <ul className={styles.grid}>
        {teams.map((team) => {
          const chosen = hydrated && clubs.some((c) => c.slug === team.slug);
          return (
            <li key={team.slug}>
              <button
                type="button"
                className={`${styles.tile} ${chosen ? styles.tileOn : ""}`}
                aria-pressed={chosen}
                onClick={() => toggle({ slug: team.slug, name: team.name })}
              >
                {chosen && (
                  <span className={styles.tick} aria-hidden="true">
                    ✓
                  </span>
                )}
                <span className={styles.tileCrest} aria-hidden="true">
                  {team.initials ?? upper(team.name.slice(0, 2))}
                </span>
                <span className={styles.tileName}>{team.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.footer}>
        <Link
          href="/kalosorisma?vima=3"
          className={favourite ? styles.primary : styles.secondary}
        >
          {/* Skippable: somebody who follows no single club is a perfectly
              ordinary reader of a federation's results.

              With more than one chosen the button counts them rather than
              naming them — three club names do not fit, and the first is
              named on the next screen anyway. */}
          {!favourite
            ? "Προσπέρασέ το"
            : clubs.length === 1
              ? `Συνέχεια με ${favourite.name}`
              : `Συνέχεια με ${clubs.length} ομάδες`}
        </Link>
        {clubs.length === 1 && (
          <p className={styles.small}>
            Πάτα την ξανά αν θέλεις να την αφαιρέσεις.
          </p>
        )}
        {clubs.length > 1 && (
          <p className={styles.small}>
            Πρώτη είναι ο <strong>{favourite!.name}</strong> — αυτή ανοίγει η
            αρχική. Πάτα την ξανά για να την αφαιρέσεις.
          </p>
        )}
      </div>
    </>
  );
}
