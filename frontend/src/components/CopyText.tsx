"use client";

import { useState } from "react";

import styles from "./CopyText.module.css";

/** "Αντιγραφή ως κείμενο" — the round or the table as plain lines, ready to
 *  paste into Viber. That group chat, not Facebook, is how results travel in
 *  the federation, and a link there is one more tap nobody makes. */
export function CopyText({ text, label = "Αντιγραφή ως κείμενο" }: { text: string; label?: string }) {
  const [said, setSaid] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setSaid("Αντιγράφηκε ✓");
    } catch {
      // No clipboard (an old browser, an insecure origin): hand it over.
      window.prompt("Αντέγραψε το κείμενο:", text);
      return;
    }
    window.setTimeout(() => setSaid(null), 2500);
  }

  return (
    <button type="button" className={styles.button} onClick={copy}>
      <span aria-live="polite">{said ?? label}</span>
    </button>
  );
}
