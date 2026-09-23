"use client";

import { useSyncExternalStore } from "react";

const KEY = "pamesentra:welcomed";

/** Whether the reader has been through — or waved off — the welcome.
 *
 *  Deliberately not a route guard. Most people arrive from a link somebody
 *  sent them, to one specific match, and putting three screens in front of
 *  that is how a site loses the visit it was about to win. The welcome is
 *  offered from the home page and nowhere else; this flag only stops it being
 *  offered twice.
 */
const listeners = new Set<() => void>();
let snapshot = false;
let loaded = false;

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Storage blocked. Treated as "already welcomed" rather than showing the
    // banner on every single page load for the rest of their life.
    return true;
  }
}

function subscribe(listener: () => void) {
  if (!loaded) {
    snapshot = read();
    loaded = true;
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markWelcomed() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // In memory is enough to stop it reappearing during this visit.
  }
  snapshot = true;
  listeners.forEach((l) => l());
}

export function useWelcomed() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    // The server cannot know, and guessing "not yet" flashes the banner at
    // everybody on every load before hydration corrects it.
    () => true,
  );
}

export { KEY as WELCOME_KEY };
