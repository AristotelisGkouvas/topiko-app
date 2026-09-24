"use client";

import { useSyncExternalStore } from "react";

const KEY = "pamesentra:clubs";
/** What the single-club version wrote. Read once, then migrated. */
const LEGACY_KEY = "pamesentra:club";

/** A club the reader follows. */
export interface Favourite {
  slug: string;
  name: string;
}

/** Following is a list now, not one club.
 *
 *  The handoff asks for it, and it matches how people actually watch local
 *  football: a village club, the town side their cousin plays for, and the
 *  youth team their child is in. The first in the list is "η ομάδα μου" — the
 *  one the home page opens on and the one a share card names — because a home
 *  screen cannot lead with three.
 *
 *  One store for every component on the page. Two stars for the same club have
 *  to agree the moment either is pressed, and a `useState` in each would not.
 */
const listeners = new Set<() => void>();
let snapshot: Favourite[] = [];
let loaded = false;

function read(): Favourite[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return parse(raw);

    // Somebody who followed one club before this existed keeps following it.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const one = parse(`[${legacy}]`);
      if (one.length > 0) {
        window.localStorage.setItem(KEY, JSON.stringify(one));
        return one;
      }
    }
    return [];
  } catch {
    // Private mode, or site data blocked. Following is a convenience, not a
    // feature to break the page over.
    return [];
  }
}

function parse(raw: string): Favourite[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      const club = item as Partial<Favourite>;
      return club?.slug && club?.name
        ? [{ slug: club.slug, name: club.name }]
        : [];
    });
  } catch {
    // Hand-edited or written by an older build. Treated as empty rather than
    // cleared, so nothing is destroyed on a bad read.
    return [];
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
/** The server has no localStorage, so it renders the not-following state and
 *  the client corrects it after hydration. Returning anything else here is a
 *  hydration mismatch. A shared constant, because a fresh `[]` each call is a
 *  new identity and makes useSyncExternalStore loop. */
const EMPTY: Favourite[] = [];
const getServerSnapshot = () => EMPTY;

function write(clubs: Favourite[]) {
  try {
    if (clubs.length > 0) window.localStorage.setItem(KEY, JSON.stringify(clubs));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Still update in memory, so the star responds for this visit at least.
  }
  snapshot = clubs;
  listeners.forEach((l) => l());
}

export function useFavourite() {
  const clubs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Not wrapped in useCallback: the React Compiler memoizes these for us, and
  // a manual dependency list it cannot verify makes it skip the component.
  const toggle = (club: Favourite) => {
    const already = clubs.some((c) => c.slug === club.slug);
    write(
      already
        ? clubs.filter((c) => c.slug !== club.slug)
        : // Appended, not prepended: following a second club should not quietly
          // demote the one the home page has been opening on.
          [...clubs, club],
    );
  };

  /** Move a club to the front — make it "my club". */
  const promote = (slug: string) => {
    const club = clubs.find((c) => c.slug === slug);
    if (!club) return;
    write([club, ...clubs.filter((c) => c.slug !== slug)]);
  };

  return {
    clubs,
    /** The one the home page opens on: the first followed. */
    favourite: clubs[0] ?? null,
    toggle,
    promote,
    following: (slug: string) => clubs.some((c) => c.slug === slug),
  };
}

/** True once the browser has been read, so a panel can tell "nothing stored"
 *  apart from "not read yet" and avoid flashing an empty state on every load. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export { KEY as FAVOURITE_KEY };
