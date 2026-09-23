"use client";

import Link from "next/link";

import { useFavourite, useHydrated } from "@/lib/favourite";
import { markWelcomed, useWelcomed } from "@/lib/onboarding";
import styles from "./WelcomeCard.module.css";

/** The one invitation to the welcome, on the home page.
 *
 *  Not a modal and not a redirect. Somebody who arrived from a link a friend
 *  sent them came for a score, and three screens in front of it is how a site
 *  loses that visit. This sits in the page, above the fold, and goes away for
 *  good the moment it is used or dismissed.
 *
 *  It also stays away from anybody who has already picked a club by other
 *  means — they have done the only step that matters.
 */
export function WelcomeCard() {
  const welcomed = useWelcomed();
  const { favourite } = useFavourite();
  const hydrated = useHydrated();

  // Before hydration both stores answer "yes, already done", so nothing is
  // rendered on the server and nothing flashes in.
  if (!hydrated || welcomed || favourite) return null;

  return (
    <aside className={styles.card}>
      <div className={styles.text}>
        <p className={styles.title}>Πρώτη φορά εδώ;</p>
        <p className={styles.body}>
          Διάλεξε το σωματείο σου και θα το βλέπεις πρώτο, σε κάθε σελίδα.
        </p>
      </div>
      <div className={styles.buttons}>
        <Link href="/kalosorisma" className={styles.go}>
          Ξεκίνα
        </Link>
        <button
          type="button"
          className={styles.dismiss}
          onClick={markWelcomed}
          aria-label="Απόρριψη καλωσορίσματος"
        >
          ✕
        </button>
      </div>
    </aside>
  );
}
