"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useFavourite, useHydrated } from "@/lib/favourite";
import { markWelcomed, useWelcomed } from "@/lib/onboarding";
import styles from "./WelcomeCard.module.css";
import { Icon } from "@/components/Icon";

function introFinished(): boolean {
  return (
    document.documentElement.dataset.intro === "seen" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function watchIntro(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-intro"],
  });
  return () => observer.disconnect();
}

/** The welcome, on a first visit to the home page: a dialog in front of the
 *  page that asks one thing — pick your club, or not now.
 *
 *  Home page only, and never again once answered either way, so a reader who
 *  arrives from a shared match link goes straight to the match. Nor for
 *  anybody who already picked a club by other means.
 *
 *  It waits for the intro. A modal dialog sits in the browser's top layer,
 *  above any z-index, so opened at once it would cover the intro's first
 *  seconds; it opens once <html> is marked `data-intro="seen"` instead (set
 *  by the intro when it ends, or before paint when it already played).
 */
export function WelcomeCard() {
  const welcomed = useWelcomed();
  const { favourite } = useFavourite();
  const hydrated = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);
  const introDone = useSyncExternalStore(watchIntro, introFinished, () => false);

  const wanted = hydrated && !welcomed && !favourite;

  useEffect(() => {
    const el = dialog.current;
    if (wanted && introDone && el && !el.open) el.showModal();
  }, [wanted, introDone]);

  if (!wanted) return null;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="welcome-title"
      // Esc, the ✕ and "Όχι τώρα" all count as an answer.
      onClose={markWelcomed}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
    >
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => dialog.current?.close()}
        aria-label="Κλείσιμο"
      >
        <Icon name="close" size={16} />
      </button>
      <p id="welcome-title" className={styles.title}>
        Πρώτη φορά εδώ;
      </p>
      <p className={styles.body}>
        Διάλεξε το σωματείο σου και θα το βλέπεις πρώτο, σε κάθε σελίδα.
      </p>
      <div className={styles.buttons}>
        <Link href="/kalosorisma" className={styles.go} onClick={markWelcomed}>
          Διάλεξε ομάδα
        </Link>
        <button type="button" className={styles.later} onClick={() => dialog.current?.close()}>
          Όχι τώρα
        </button>
      </div>
    </dialog>
  );
}
