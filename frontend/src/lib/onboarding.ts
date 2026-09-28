"use client";

import { useSyncExternalStore } from "react";

const KEY = "pamesentra:welcomed";
const INVITE_KEY = "pamesentra:invite-dismissed";

/** A yes/no the reader answers once and this browser remembers.
 *
 *  Deliberately not a route guard. Most people arrive from a link somebody
 *  sent them, to one specific match, and putting three screens in front of
 *  that is how a site loses the visit it was about to win.
 */
function flag(key: string) {
  const listeners = new Set<() => void>();
  let snapshot = false;
  let loaded = false;

  function read(): boolean {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      // Storage blocked. Treated as "already answered" rather than asking on
      // every single page load for the rest of their life.
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

  function mark() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // In memory is enough to stop it reappearing during this visit.
    }
    snapshot = true;
    listeners.forEach((l) => l());
  }

  function useFlag() {
    return useSyncExternalStore(
      subscribe,
      () => snapshot,
      // The server cannot know, and guessing "not yet" flashes the question
      // at everybody on every load before hydration corrects it.
      () => true,
    );
  }

  return { mark, useFlag };
}

/** Whether the reader has been through, or skipped, the /kalosorisma steps. */
const welcomed = flag(KEY);
export const markWelcomed = welcomed.mark;
export const useWelcomed = welcomed.useFlag;

/** Whether the reader said "not now" to the club picker on the home page. */
const invite = flag(INVITE_KEY);
export const dismissInvite = invite.mark;
export const useInviteDismissed = invite.useFlag;

export { KEY as WELCOME_KEY };
