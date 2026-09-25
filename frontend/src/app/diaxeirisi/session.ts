"use client";

import { ApiError } from "@/lib/api";

/** Fired when a save comes back 401 after the page believed it was signed in.
 *
 *  The dashboard listens and asks for the password again *over* what is on
 *  screen. Swapping the whole page for the login form used to throw away a
 *  half-typed 3–3, and after a reload it was simply gone.
 */
export const SESSION_LOST = "pamesentra:editor-session-lost";

export function noteAuthError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    window.dispatchEvent(new Event(SESSION_LOST));
  }
}
