"use client";

import { useSyncExternalStore } from "react";

import { READABILITY_KEYS as KEYS } from "./readabilityBoot";

/** "Μεγάλα γράμματα" and "Υψηλή αντίθεση": two switches, kept in this
 *  browser, applied as attributes on <html> so plain CSS can act on them.
 *
 *  Set before first paint by the inline script in the layout; this module
 *  keeps them in step afterwards. */
export type Readability = { large: boolean; contrast: boolean };

const ATTRS = { large: ["data-text", "large"], contrast: ["data-contrast", "high"] } as const;

const listeners = new Set<() => void>();
let snapshot: Readability = { large: false, contrast: false };
let loaded = false;

function read(): Readability {
  try {
    return {
      large: window.localStorage.getItem(KEYS.large) === "1",
      contrast: window.localStorage.getItem(KEYS.contrast) === "1",
    };
  } catch {
    return { large: false, contrast: false };
  }
}

function apply(state: Readability) {
  const html = document.documentElement;
  for (const key of ["large", "contrast"] as const) {
    const [attr, value] = ATTRS[key];
    if (state[key]) html.setAttribute(attr, value);
    else html.removeAttribute(attr);
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

export function setReadability(key: keyof Readability, on: boolean) {
  snapshot = { ...snapshot, [key]: on };
  try {
    if (on) window.localStorage.setItem(KEYS[key], "1");
    else window.localStorage.removeItem(KEYS[key]);
  } catch {
    // This visit only, then.
  }
  apply(snapshot);
  listeners.forEach((l) => l());
}

const SERVER: Readability = { large: false, contrast: false };

export function useReadability(): Readability {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER);
}
