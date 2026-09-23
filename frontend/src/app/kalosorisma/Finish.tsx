"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { NotifyButton } from "@/components/NotifyButton";
import { useFavourite, useHydrated } from "@/lib/favourite";
import { markWelcomed } from "@/lib/onboarding";
import styles from "./page.module.css";

/** Step three: notifications, then out.
 *
 *  The permission prompt is not fired here. It is fired by NotifyButton, when
 *  the reader presses it, for a named club — a browser prompt that appears
 *  because a page loaded is the one people deny out of reflex, and a denial
 *  is not something the site can ask about again.
 */
export function Finish() {
  const { favourite } = useFavourite();
  const hydrated = useHydrated();
  const router = useRouter();

  function done(href: string) {
    markWelcomed();
    router.push(href);
  }

  return (
    <>
      {!hydrated ? (
        // Nothing is claimed before the browser has been read: rendering
        // "you follow nobody" and correcting it a frame later reads as a bug.
        <p className={styles.lead}>…</p>
      ) : favourite ? (
        <>
          <p className={styles.lead}>
            Ακολουθείς τον <strong>{favourite.name}</strong>. Θες να μαθαίνεις
            τα γκολ και το τελικό σφύριγμα την ώρα που γίνονται;
          </p>
          <div className={styles.notify}>
            <NotifyButton slug={favourite.slug} name={favourite.name} />
          </div>
          <p className={styles.small}>
            Μπορείς να τις κλείσεις όποτε θες από τη σελίδα του σωματείου.
          </p>
        </>
      ) : (
        <p className={styles.lead}>
          Δεν διάλεξες σωματείο — κανένα πρόβλημα. Οι ειδοποιήσεις υπάρχουν σε
          κάθε σελίδα σωματείου, όποτε αποφασίσεις.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => done("/")}
        >
          Πάμε
        </button>
        {favourite && (
          <Link
            href={`/somateia/${favourite.slug}`}
            className={styles.secondary}
            onClick={() => markWelcomed()}
          >
            Στη σελίδα του σωματείου
          </Link>
        )}
      </div>
    </>
  );
}
