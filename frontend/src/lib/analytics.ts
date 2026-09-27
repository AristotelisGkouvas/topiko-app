import { apiUrl } from "./api";

/** What the site may report — the same list the API accepts
 *  (backend/app/api/v1/analytics.py, EVENTS). */
export type AnalyticsEventName =
  | "share"
  | "directions"
  | "story"
  | "table_image"
  | "copy_text"
  | "calendar"
  | "follow"
  | "unfollow"
  | "search"
  | "notify_on"
  | "notify_off"
  | "install_prompt"
  | "installed"
  | "theme"
  | "readability"
  | "prediction"
  | "mvp_vote"
  | "outbound"
  | "js_error"
  | "vital"
  | "not_found";

/** Readers who ask not to be tracked are not: Global Privacy Control, and the
 *  older Do Not Track. The server also drops requests carrying Sec-GPC. */
export function trackingAllowed(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return !nav.globalPrivacyControl && nav.doNotTrack !== "1";
}

/** Report one reader action. Fire and forget: a lost count is never worth an
 *  error on a reader's screen. */
export function track(name: AnalyticsEventName, props?: Record<string, string | number | boolean | null>) {
  if (!trackingAllowed()) return;
  try {
    void fetch(apiUrl("/analytics/event"), {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path: location.pathname, props }),
    }).catch(() => {});
  } catch {
    // Nothing: statistics are never allowed to break a page.
  }
}

export function post(path: string, body: unknown): Promise<Response | null> {
  return fetch(apiUrl(path), {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
}
