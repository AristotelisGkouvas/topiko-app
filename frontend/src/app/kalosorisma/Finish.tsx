"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { NotifyButton } from "@/components/NotifyButton";
import { apiUrl, jsonFetcher } from "@/lib/api";
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
  // Same key as NotifyButton's, so SWR asks once. Without push keys on the
  // server there is no button to offer, and a screen promising alerts with
  // nothing to press reads as broken.
  const { data: push } = useSWR<{ enabled: boolean; public_key: string | null }>(
    apiUrl("/push/config"),
    jsonFetcher,
  );
  const pushReady = !!push?.enabled && !!push.public_key;

  function done(href: string) {
    markWelcomed();
    router.push(href);
  }

  return (
    <>
      {/* The design names the club in the heading — "Μάθε πρώτος για τον Άτλα"
          rather than "Ειδοποιήσεις". The reader has just chosen it, and a
          heading that repeats their choice back is what makes the switch below
          feel like it is about their team rather than about the app. */}
      <h1 className={styles.heading}>
        {!pushReady
          ? "Όλα έτοιμα"
          : hydrated && favourite
            ? `Μάθε πρώτος για τον ${favourite.name}`
            : "Ειδοποιήσεις"}
      </h1>

      {!pushReady ? (
        <p className={styles.lead}>
          {hydrated && favourite
            ? `Ο ${favourite.name} θα σε περιμένει πρώτος στην αρχική. Άλλαξέ τον οποτεδήποτε με το ☆ στη σελίδα κάθε σωματείου.`
            : "Διάλεξε ομάδα οποτεδήποτε με το ☆ στη σελίδα του σωματείου."}
        </p>
      ) : !hydrated ? (
        // Nothing is claimed before the browser has been read: rendering
        // "you follow nobody" and correcting it a frame later reads as a bug.
        <p className={styles.lead}>…</p>
      ) : favourite ? (
        <>
          <p className={styles.lead}>
            Στέλνουμε μόνο γκολ και τελικό σφύριγμα, και μόνο για αυτή την
            ομάδα. Αλλάζει οποτεδήποτε από τη σελίδα του σωματείου.
          </p>
          <div className={styles.notify}>
            <NotifyButton slug={favourite.slug} name={favourite.name} />
          </div>
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
