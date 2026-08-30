"use client";

import { useEffect } from "react";

import styles from "./error.module.css";

/** The realistic failure here is "the API is down", not a React crash, so the
 *  copy says what the reader can do rather than apologising in the abstract. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Κάτι πήγε στραβά</h1>
      <p className={styles.body}>
        Δεν καταφέραμε να φορτώσουμε τα δεδομένα. Συνήθως φταίει προσωρινή
        διακοπή — δοκίμασε ξανά σε λίγο.
      </p>
      {error.digest && <p className={styles.detail}>Κωδικός: {error.digest}</p>}
      <button type="button" className={styles.action} onClick={reset}>
        Δοκίμασε ξανά
      </button>
    </div>
  );
}
