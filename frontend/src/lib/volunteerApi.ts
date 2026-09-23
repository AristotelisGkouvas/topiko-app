"use client";

// The feed shape is the ticker's. Both ends render the same afternoon, so a
// second declaration of it here would be a second thing to keep in step.
import type { MatchFeed } from "@/components/MatchTicker";
import { API_URL, ASSOCIATION } from "./api";
import type { Match } from "./types";

/** The club representative's half of the API.
 *
 *  Separate from `editorApi` on purpose, mirroring the backend: the two are
 *  different doors with different keys, and a single client object that could
 *  reach both would make it easy to call the wrong one.
 */

const base = () => `${API_URL}/api/v1/${ASSOCIATION}/ethelontis`;

export interface Volunteer {
  team_slug: string;
  team_name: string;
  label: string | null;
}

export class VolunteerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VolunteerError";
  }
}

async function call<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const response = await fetch(`${base()}${path}`, {
    // The session is an httpOnly cookie; without this it is simply not sent.
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // A non-JSON error body is not worth failing twice over.
    }
    throw new VolunteerError(response.status, detail);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}

export const volunteerApi = {
  login: (code: string) =>
    call<Volunteer>("/login", { method: "POST", body: JSON.stringify({ code }) }),

  logout: () => call<null>("/logout", { method: "POST" }),

  me: () => call<Volunteer>("/me"),

  matches: () => call<Match[]>("/matches"),

  feed: (matchId: number) => call<MatchFeed>(`/matches/${matchId}/feed`),

  undo: (matchId: number, eventId: number) =>
    call<MatchFeed>(`/matches/${matchId}/events/${eventId}`, { method: "DELETE" }),
};
