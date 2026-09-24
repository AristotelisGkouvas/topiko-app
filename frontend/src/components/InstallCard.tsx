"use client";

import { useSyncExternalStore } from "react";

import styles from "./LeagueRail.module.css";

/** "Εγκατάσταση εφαρμογής", from the design's left rail.
 *
 *  Only shown when the browser has actually offered to install — Chrome fires
 *  `beforeinstallprompt` when it judges the site installable, and there is no
 *  way to open that dialog without the event it hands you. A button that is
 *  always there and does nothing on iOS, or on a second visit after installing,
 *  is worse than no button.
 *
 *  The event is caught at module load rather than in an effect, because it
 *  fires early — often before React has mounted anything — and a listener
 *  attached afterwards never hears it.
 */

type Prompt = Event & { prompt: () => Promise<void> };

let deferred: Prompt | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome shows its own mini-infobar unless this is prevented; the design
    // puts the invitation in the rail instead.
    event.preventDefault();
    deferred = event as Prompt;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function InstallCard() {
  const available = useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    // The server cannot know, and rendering the card then removing it makes
    // the rail jump on every load.
    () => false,
  );

  if (!available) return null;

  return (
    <div className={styles.install}>
      <p className={styles.installTitle}>Εγκατάσταση εφαρμογής</p>
      <p className={styles.installBody}>
        Στην αρχική οθόνη, με ειδοποιήσεις και χωρίς σύνδεση.
      </p>
      <button
        type="button"
        className={styles.installButton}
        onClick={() => {
          const prompt = deferred;
          deferred = null;
          listeners.forEach((l) => l());
          void prompt?.prompt();
        }}
      >
        Εγκατάσταση
      </button>
    </div>
  );
}
