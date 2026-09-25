import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import styles from "./error.module.css";

/** Screen E3. "Ωχ!" in the navy bar, then a ringed question mark and one way
 *  out — and the way out is the search, not the home page.
 *
 *  Somebody who lands here was looking for a specific club or season, and the
 *  home page does not help them find it; a search box does. The design makes
 *  that the single filled button, and the copy names the two things that
 *  actually cause this: a club that was renamed, a season that was archived.
 */
export default function NotFound() {
  return (
    <>
      <PageHeader title="Ωχ!" />
      <div className={styles.wrap}>
        <span className={styles.mark} aria-hidden="true">
          ?
        </span>
        <p className={styles.title}>Η σελίδα δεν βρέθηκε</p>
        <p className={styles.body}>
          Ίσως ο σύνδεσμος είναι παλιός ή έχει λάθος. Δοκίμασε την αναζήτηση —
          βρίσκει σωματεία, γήπεδα και παίκτες.
        </p>
        <div className={styles.actions}>
          <Link href="/anazitisi" className={styles.action}>
            Αναζήτηση
          </Link>
          <Link href="/" className={styles.quiet}>
            Στην αρχική
          </Link>
        </div>
      </div>
    </>
  );
}
