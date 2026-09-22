"use client";

import { useSyncExternalStore } from "react";

const KEY = "pamesentra:club";

/** The club the reader follows, as {slug, name}, or null. */
export interface Favourite {
  slug: string;
  name: string;
}

// One store for every component on the page. Two stars for the same club have
// to agree the moment either is pressed, and a `useState` in each would not.
const listeners = new Set<() => void>();
let snapshot: string | null = null;
let loaded = false;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Private mode, or site data blocked. Following is a convenience, not a
    // feature to break the page over.
    return null;
  }
}

function subscribe(listener: () => void) {
  if (!loaded) {
    snapshot = read();
    loaded = true;
  }
  listeners.add(listener);
  // Another tab following a different club should not leave this one lying.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      snapshot = read();
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = () => snapshot;
// The server has no localStorage, so it renders the not-following state and
// the client corrects it after hydration. Returning anything else here is a
// hydration mismatch.
const getServerSnapshot = () => null;

function write(value: Favourite | null) {
  try {
    if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Still update in memory, so the star responds for this visit at least.
  }
  snapshot = value ? JSON.stringify(value) : null;
  listeners.forEach((l) => l());
}

export function useFavourite() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  let favourite: Favourite | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Favourite>;
      if (parsed?.slug && parsed?.name) {
        favourite = { slug: parsed.slug, name: parsed.name };
      }
    } catch {
      // A value written by an older build, or hand-edited. Treated as absent
      // rather than cleared, so nothing is destroyed on a bad read.
    }
  }

  // Not wrapped in useCallback: the React Compiler memoizes this for us, and a
  // manual dependency list it cannot verify makes it skip the whole component.
  const toggle = (club: Favourite) => {
    write(favourite?.slug === club.slug ? null : club);
  };

  return { favourite, toggle, following: (slug: string) => favourite?.slug === slug };
}

/** True once the browser has been read, so a panel can tell "nothing stored"
 *  apart from "not read yet" and avoid flashing an empty state on every load. */
export function useHydrated() {
  const raw = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return raw;
}

export { KEY as FAVOURITE_KEY };
