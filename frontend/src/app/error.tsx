"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { PageHeader } from "@/components/PageHeader";
import { clockTime, useSavedAt } from "@/lib/freshness";
import { useOnline } from "@/lib/outbox";
import styles from "./error.module.css";

/** The realistic failure here is "the API is unreachable", not a React crash.
 *
 *  And "unreachable" has two quite different causes that deserve two different
 *  screens. A phone behind a hill is not a broken site, and telling somebody
 *  standing in a field that something went wrong — when what went wrong is
 *  their reception — sends them to reload a page that cannot load, and leaves
 *  them thinking the site is unreliable.
 *
 *  Both take screen E3's shape: a ringed mark, a sentence, one filled action.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const online = useOnline();
  const savedAt = useSavedAt(usePathname());

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    // Retried by itself the moment the signal returns. Somebody who has put
    // the phone back in their pocket should find the page loaded, not a
    // button waiting to be pressed.
    if (online) reset();
  }, [online, reset]);

  if (!online) {
    return (
      <>
        <PageHeader title="Χωρίς σύνδεση" />
        <div className={styles.wrap}>
          <span className={styles.mark} aria-hidden="true">
            ⌁
          </span>
          <p className={styles.title}>Δεν φόρτωσε η σελίδα</p>
          <p className={styles.body}>
            Το κινητό δεν έχει σήμα αυτή τη στιγμή. Θα ξαναδοκιμάσει μόνη της
            μόλις επανέλθει.
            {savedAt !== null && (
              <> Είχε φορτώσει τελευταία στις {clockTime(savedAt)}.</>
            )}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.action} onClick={reset}>
              Δοκίμασε ξανά
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ωχ!" />
      <div className={styles.wrap}>
        <span className={styles.mark} aria-hidden="true">
          !
        </span>
        <p className={styles.title}>Κάτι πήγε στραβά</p>
        <p className={styles.body}>
          Δεν καταφέραμε να φορτώσουμε τα δεδομένα. Συνήθως φταίει προσωρινή
          διακοπή — δοκίμασε ξανά σε λίγο.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={reset}>
            Δοκίμασε ξανά
          </button>
        </div>
        {error.digest && <p className={styles.detail}>Κωδικός: {error.digest}</p>}
      </div>
    </>
  );
}
