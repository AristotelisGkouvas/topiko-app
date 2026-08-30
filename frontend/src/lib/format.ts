import type { MatchStatus, StandingZone } from "./types";

/** Matches are played in Greece, so they are always displayed in Greek time —
 *  never in the reader's local zone, which would show a Sunday 16:00 kickoff as
 *  Sunday 14:00 to someone in London. */
export const TIMEZONE = "Europe/Athens";
const LOCALE = "el-GR";

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: TIMEZONE, ...options });

const timeFmt = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
const dayShortFmt = fmt({ weekday: "short" });
const dayLongFmt = fmt({ weekday: "long" });
const dateShortFmt = fmt({ day: "2-digit", month: "2-digit" });
const dateLongFmt = fmt({ day: "numeric", month: "long", year: "numeric" });

export function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "16:00" */
export function formatTime(iso: string | null): string {
  const d = parseDate(iso);
  return d ? timeFmt.format(d) : "";
}

/** Greek capitals drop the tonos: Πέμ -> ΠΕΜ, not ΠΈΜ. Plain toUpperCase keeps
 *  the accent, so the locale-aware form is the only correct one here. */
const upper = (value: string) => value.toLocaleUpperCase(LOCALE);

/** "ΚΥΡ 23/11" — the form used on match card headers. */
export function formatDayDate(iso: string | null): string {
  const d = parseDate(iso);
  if (!d) return "";
  const day = upper(dayShortFmt.format(d).replace(".", ""));
  return `${day} ${dateShortFmt.format(d)}`;
}

/** "Κυριακή" */
export function formatWeekday(iso: string | null): string {
  const d = parseDate(iso);
  return d ? dayLongFmt.format(d) : "";
}

/** "23 Νοεμβρίου 2025" */
export function formatLongDate(iso: string | null): string {
  const d = parseDate(iso);
  return d ? dateLongFmt.format(d) : "";
}

/** "Κυρ 16:00" — used in compact fixture lists. */
export function formatShortKickoff(iso: string | null): string {
  const d = parseDate(iso);
  if (!d) return "";
  const day = dayShortFmt.format(d).replace(".", "");
  return `${day} ${timeFmt.format(d)}`;
}

/**
 * "πριν 4 λεπτά". Rendered from a timestamp rather than baked on the server, so
 * the label keeps ticking while the page sits open on someone's phone.
 */
export function formatRelative(iso: string | null, now = Date.now()): string {
  const d = parseDate(iso);
  if (!d) return "άγνωστο";

  const seconds = Math.round((now - d.getTime()) / 1000);
  if (seconds < 45) return "μόλις τώρα";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `πριν ${minutes} ${minutes === 1 ? "λεπτό" : "λεπτά"}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `πριν ${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;

  const days = Math.round(hours / 24);
  if (days < 7) return `πριν ${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;

  return formatLongDate(iso);
}

/** How fresh the data is, as the three states the "last updated" dot encodes. */
export type Freshness = "fresh" | "stale" | "offline";

export function freshness(iso: string | null, now = Date.now()): Freshness {
  const d = parseDate(iso);
  if (!d) return "offline";
  const minutes = (now - d.getTime()) / 60000;
  if (minutes < 15) return "fresh";
  if (minutes < 60 * 24) return "stale";
  return "offline";
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: "ΠΡΟΣΕΧΩΣ",
  live: "LIVE",
  halftime: "ΗΜΙΧΡΟΝΟ",
  finished: "ΤΕΛΙΚΟ",
  postponed: "ΑΝΑΒΟΛΗ",
  cancelled: "ΜΑΤΑΙΩΣΗ",
  awarded: "ΚΑΤΑΚΥΡΩΣΗ",
};

export const statusLabel = (status: MatchStatus) => STATUS_LABELS[status];

const ZONE_LABELS: Record<StandingZone, string> = {
  promotion: "Άνοδος",
  promotion_playoff: "Play-off ανόδου",
  relegation_playoff: "Play-out παραμονής",
  relegation: "Υποβιβασμός",
};

export const zoneLabel = (zone: StandingZone) => ZONE_LABELS[zone];

/** "+16" / "-3" / "0" — the goal-difference column. */
export const formatGoalDifference = (value: number) =>
  value > 0 ? `+${value}` : String(value);

/** Ordinal for a matchday: 14 -> "14η". */
export const matchdayLabel = (matchday: number) => `${matchday}η αγωνιστική`;
