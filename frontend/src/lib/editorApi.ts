"use client";

import { API_URL, ASSOCIATION } from "./api";
import type { MatchFeed } from "@/components/MatchTicker";
import type { Field, Match } from "./types";

/** The editor talks to the API from the browser, not through the server.
 *
 *  The session is an httpOnly cookie on the API's origin. A server component
 *  rendering on behalf of the reader has no access to it, and forwarding it
 *  would mean caching a page that differs per user. So these calls go out from
 *  the page, with credentials, and the server half of the site stays public.
 */
//: Tenant-scoped routes. Auth is not: an account is a person, and a person
//: can hold grants in more than one association.
const scoped = `${API_URL}/api/v1/${ASSOCIATION}`;
const auth = `${API_URL}/api/v1/auth`;

export class EditorError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "EditorError";
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    // Without this the cookie is not sent cross-origin and every call is a 401
    // that looks like a login problem.
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : `Σφάλμα ${response.status}`;
    throw new EditorError(response.status, detail);
  }
  return body as T;
}

export interface EditorUser {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  associations: { slug: string; name: string; can_edit_live: boolean }[];
}

export interface AuditEntry {
  id: number;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface MatchEdit {
  home_score?: number | null;
  away_score?: number | null;
  status?: Match["status"];
  minute?: number | null;
  is_live?: boolean;
  note?: string | null;
  referee?: string | null;
  confirmed?: boolean;
}

export interface FieldEdit {
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  surface?: string | null;
  capacity?: number | null;
  has_floodlights?: boolean | null;
}

export const editorApi = {
  me: () => call<EditorUser>(`${auth}/me`),

  login: (email: string, password: string) =>
    call<EditorUser>(`${auth}/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => call<void>(`${auth}/logout`, { method: "POST" }),

  matches: (days = 3) => call<Match[]>(`${scoped}/editor/matches?days=${days}`),

  saveMatch: (id: number, edit: MatchEdit) =>
    call<Match>(`${scoped}/editor/matches/${id}`, {
      method: "PATCH",
      body: JSON.stringify(edit),
    }),

  saveField: (slug: string, edit: FieldEdit) =>
    call<Field>(`${scoped}/editor/fields/${slug}`, {
      method: "PATCH",
      body: JSON.stringify(edit),
    }),

  feed: (matchId: number) =>
    call<MatchFeed>(`${scoped}/matches/${matchId}/feed`),

  addEvent: (
    matchId: number,
    event: { kind: string; team_id?: number; minute?: number; player_name?: string },
  ) =>
    call<MatchFeed>(`${scoped}/editor/matches/${matchId}/events`, {
      method: "POST",
      body: JSON.stringify(event),
    }),

  undoEvent: (matchId: number, eventId: number) =>
    call<MatchFeed>(`${scoped}/editor/matches/${matchId}/events/${eventId}`, {
      method: "DELETE",
    }),

  audit: (limit = 30) => call<AuditEntry[]>(`${scoped}/editor/audit?limit=${limit}`),

  fields: () => call<Field[]>(`${scoped}/fields`),
};
