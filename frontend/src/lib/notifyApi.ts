"use client";

import type { components } from "./api-schema";
import { apiFetch, apiUrl } from "./api";

/** The notification settings screen's half of the API.
 *
 *  Everything here is keyed on the push endpoint the browser already holds.
 *  There are no accounts, so that endpoint — an opaque address issued by the
 *  reader's own push service, useful to nobody else — is the only thing that
 *  identifies this phone to the server.
 */

const base = () => apiUrl("/push");

/** The switches screen N1 offers. One per group, not one per event kind:
 *  nobody wants second yellows on and reds off, and thirteen switches is a
 *  screen nobody finishes. Mirrors `app.services.notify_prefs.GROUPS`. */
export const EVENT_GROUPS = [
  { key: "goal", label: "Γκολ", note: "Και πέναλτι, και αυτογκόλ." },
  { key: "status", label: "Έναρξη & τελικό σκορ", note: "Σέντρα, ημίχρονο, λήξη." },
  { key: "penalty", label: "Χαμένο πέναλτι", note: null },
  { key: "cards", label: "Κάρτες", note: "Κίτρινες και κόκκινες." },
] as const;

export type GroupKey = (typeof EVENT_GROUPS)[number]["key"];

export type TeamPrefs = components["schemas"]["PrefsOut"];

/** The endpoint this browser is subscribed with, or null if it is not.
 *
 *  Asked of the service worker rather than remembered: a push service can
 *  rotate an endpoint at any time, and a value stored when the reader first
 *  subscribed goes stale without anything saying so.
 */
export async function currentEndpoint(): Promise<string | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

export function readPrefs(endpoint: string): Promise<TeamPrefs[]> {
  return apiFetch<TeamPrefs[]>(
    `${base()}/prefs?endpoint=${encodeURIComponent(endpoint)}`,
  );
}

export async function writePrefs(body: {
  endpoint: string;
  team_slug?: string;
  prefs?: Record<string, boolean>;
  quiet_from: number | null;
  quiet_to: number | null;
}): Promise<void> {
  await apiFetch<unknown>(`${base()}/prefs`, {
    method: "PUT",
    json: {
      ...body,
      // The server stores a window in local hours and needs the offset to
      // compare it against its own clock. Negated because getTimezoneOffset
      // counts minutes *behind* UTC and everything else counts them ahead.
      utc_offset: -new Date().getTimezoneOffset(),
    },
  });
}
