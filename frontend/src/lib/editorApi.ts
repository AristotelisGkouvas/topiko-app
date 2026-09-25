"use client";

import type { components } from "./api-schema";
import { API_URL, apiFetch, apiUrl } from "./api";
import type { Field, Match, MatchFeed, Team, TeamLook } from "./types";

/** The editor talks to the API from the browser, not through the server.
 *
 *  The session is an httpOnly cookie on the API's origin. A server component
 *  rendering on behalf of the reader has no access to it, and forwarding it
 *  would mean caching a page that differs per user. So these calls go out from
 *  the page, with credentials, and the server half of the site stays public.
 */
//: Tenant-scoped routes. Auth is not: an account is a person, and a person
//: can hold grants in more than one association.
const scoped = apiUrl("");
const auth = `${API_URL}/api/v1/auth`;

function call<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  return apiFetch<T>(url, { ...init, credentials: "include" });
}

export type EditorUser = components["schemas"]["UserOut"];

export type ScrapeRun = components["schemas"]["ScrapeRunOut"];

export type AuditEntry = components["schemas"]["AuditEntryOut"];

export type MatchEdit = components["schemas"]["MatchEdit"];

export type FieldEdit = components["schemas"]["FieldEdit"];

export type TeamLookEdit = components["schemas"]["TeamLookEdit"];

export type SponsorEdit = components["schemas"]["SponsorEdit"];

/** A multipart upload. No Content-Type header: the browser sets it, with the
 *  boundary the body needs. */
function upload<T>(url: string, method: string, fields: Record<string, Blob | string | null | undefined>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined && value !== "") body.append(key, value);
  }
  return call<T>(url, { method, body });
}

const team = (slug: string) => `${scoped}/editor/teams/${slug}`;

export const editorApi = {
  me: () => call<EditorUser>(`${auth}/me`),

  login: (email: string, password: string) =>
    call<EditorUser>(`${auth}/login`, {
      method: "POST",
      json: { email, password },
    }),

  logout: () => call<void>(`${auth}/logout`, { method: "POST" }),

  matches: (days = 3) => call<Match[]>(`${scoped}/editor/matches?days=${days}`),

  saveMatch: (id: number, edit: MatchEdit) =>
    call<Match>(`${scoped}/editor/matches/${id}`, {
      method: "PATCH",
      json: edit,
    }),

  saveField: (slug: string, edit: FieldEdit) =>
    call<Field>(`${scoped}/editor/fields/${slug}`, {
      method: "PATCH",
      json: edit,
    }),

  feed: (matchId: number) =>
    call<MatchFeed>(`${scoped}/matches/${matchId}/feed`),

  addEvent: (
    matchId: number,
    event: { kind: string; team_id?: number; minute?: number; player_name?: string },
  ) =>
    call<MatchFeed>(`${scoped}/editor/matches/${matchId}/events`, {
      method: "POST",
      json: event,
    }),

  undoEvent: (matchId: number, eventId: number) =>
    call<MatchFeed>(`${scoped}/editor/matches/${matchId}/events/${eventId}`, {
      method: "DELETE",
    }),

  scrapeRuns: (limit = 20) =>
    call<ScrapeRun[]>(`${scoped}/editor/scrape-runs?limit=${limit}`),

  audit: (limit = 30) => call<AuditEntry[]>(`${scoped}/editor/audit?limit=${limit}`),

  fields: () => call<Field[]>(`${scoped}/fields`),

  /* ---- A club's look (admin only) ---- */

  teams: () => call<Team[]>(`${scoped}/teams`),

  look: (slug: string) => call<TeamLook>(team(slug)),

  saveColours: (slug: string, edit: TeamLookEdit) =>
    call<TeamLook>(team(slug), { method: "PATCH", json: edit }),

  setLogo: (slug: string, file: Blob) =>
    upload<TeamLook>(`${team(slug)}/logo`, "PUT", { file }),

  removeLogo: (slug: string) =>
    call<TeamLook>(`${team(slug)}/logo`, { method: "DELETE" }),

  addPhoto: (slug: string, file: Blob, caption?: string) =>
    upload<TeamLook>(`${team(slug)}/photos`, "POST", { file, caption }),

  captionPhoto: (slug: string, id: number, caption: string | null) =>
    call<TeamLook>(`${team(slug)}/photos/${id}`, { method: "PATCH", json: { caption } }),

  removePhoto: (slug: string, id: number) =>
    call<TeamLook>(`${team(slug)}/photos/${id}`, { method: "DELETE" }),

  orderPhotos: (slug: string, ids: number[]) =>
    call<TeamLook>(`${team(slug)}/photos/order`, { method: "PUT", json: { ids } }),

  addSponsor: (slug: string, fields: { name: string; website_url?: string; file?: Blob | null }) =>
    upload<TeamLook>(`${team(slug)}/sponsors`, "POST", fields),

  saveSponsor: (slug: string, id: number, edit: SponsorEdit) =>
    call<TeamLook>(`${team(slug)}/sponsors/${id}`, { method: "PATCH", json: edit }),

  setSponsorLogo: (slug: string, id: number, file: Blob) =>
    upload<TeamLook>(`${team(slug)}/sponsors/${id}/logo`, "PUT", { file }),

  removeSponsor: (slug: string, id: number) =>
    call<TeamLook>(`${team(slug)}/sponsors/${id}`, { method: "DELETE" }),

  orderSponsors: (slug: string, ids: number[]) =>
    call<TeamLook>(`${team(slug)}/sponsors/order`, { method: "PUT", json: { ids } }),
};
