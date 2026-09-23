"use client";

import { useSyncExternalStore } from "react";

/** When the page in front of the reader was last fetched for real.
 *
 *  Kept per path, because that is the question being answered. The service
 *  worker hands back whatever copy of this page it has, which may be from
 *  this morning while another page's copy is from Tuesday — "last time the
 *  phone had signal" would put one number on all of them and be wrong about
 *  most.
 *
 *  An external store rather than state in an effect, for the same reason the
 *  outbox is one: the connection changes without React being involved, and
 *  reading it in an effect to call setState renders twice and is what the
 *  compiler refuses.
 */

const KEY = "pamesentra:seen";

const listeners = new Set<() => void>();
let seen: Record<string, number> = {};
let loaded = false;

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    seen = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    // Unreadable or hand-edited. An unknown save time prints no time at all,
    // which is the honest answer and not a reason to break the bar.
    seen = {};
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // Storage blocked or full. The stamp still holds for this visit.
  }
}

/** Record that this path was just delivered by the network. */
export function markSeen(path: string) {
  if (!loaded) {
    load();
    loaded = true;
  }
  seen = { ...seen, [path]: Date.now() };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (!loaded) {
    load();
    loaded = true;
  }
  listeners.add(listener);

  // The bar has to reappear and disappear with the connection.
  const bump = () => listeners.forEach((l) => l());
  window.addEventListener("online", bump);
  window.addEventListener("offline", bump);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("online", bump);
    window.removeEventListener("offline", bump);
  };
}

/** When this path was last fetched, or null if we have never recorded it. */
export function useSavedAt(path: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => seen[path] ?? null,
    // The server has nothing saved and no connection to have lost.
    () => null,
  );
}

/** Just the clock time, which is all the bar has room for. A date would only
 *  matter to somebody whose phone has been out of range since yesterday, and
 *  they have a larger problem than a stale table. */
export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString("el-GR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
