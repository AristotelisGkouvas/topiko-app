"use client";

import type { components } from "./api-schema";
import { apiFetch, apiUrl } from "./api";
import type { Match, MatchFeed, RosterPlayer } from "./types";

/** The club representative's half of the API.
 *
 *  Separate from `editorApi` on purpose, mirroring the backend: the two are
 *  different doors with different keys, and a single client object that could
 *  reach both would make it easy to call the wrong one.
 */

const base = () => apiUrl("/ethelontis");

export type Volunteer = components["schemas"]["VolunteerOut"];

async function call<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T | null> {
  // The session is an httpOnly cookie; without credentials it is not sent.
  const body = await apiFetch<T>(`${base()}${path}`, { ...init, credentials: "include" });
  return body ?? null;
}

export const volunteerApi = {
  login: (code: string) =>
    call<Volunteer>("/login", { method: "POST", json: { code } }),

  logout: () => call<null>("/logout", { method: "POST" }),

  me: () => call<Volunteer>("/me"),

  matches: () => call<Match[]>("/matches"),

  /** The club's players, ordered by goals — the scorer sheet's list. */
  roster: () => call<RosterPlayer[]>("/roster"),

  feed: (matchId: number) => call<MatchFeed>(`/matches/${matchId}/feed`),

  undo: (matchId: number, eventId: number) =>
    call<MatchFeed>(`/matches/${matchId}/events/${eventId}`, { method: "DELETE" }),
};
