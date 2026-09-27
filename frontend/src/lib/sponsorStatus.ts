/** A sponsor's state in words, for the dashboard. The API decides it (see
 *  backend services/sponsorship.status); this only names it. */
export const SPONSOR_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "off" | "wait" }> = {
  live: { label: "Ενεργός", tone: "ok" },
  ending: { label: "Λήγει σύντομα", tone: "warn" },
  ended: { label: "Έληξε", tone: "off" },
  scheduled: { label: "Προγραμματισμένος", tone: "wait" },
  paused: { label: "Σε παύση", tone: "off" },
};

/** "31/10/2026" from "2026-10-31", without a Date and its time zone. */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Days from today (Greek calendar) to an ISO date; negative when past. */
export function daysUntil(iso: string, now = Date.now()): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(now);
  return Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
}
