"use client";

import styles from "./page.module.css";

/** Paper for the dressing room. The print stylesheet drops the site chrome. */
export function PrintButton() {
  return (
    <button type="button" className={styles.link} onClick={() => window.print()}>
      Εκτύπωση
    </button>
  );
}
