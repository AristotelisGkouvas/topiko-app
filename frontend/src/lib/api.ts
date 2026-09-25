import type {
  Announcement,
  Association,
  Comparison,
  Field,
  FieldDetail,
  HeadToHead,
  League,
  LiveTable,
  Match,
  MatchDetail,
  MatchStatus,
  Meta,
  OnThisDay,
  PlayerDetail,
  PlayerSearchResult,
  Records,
  Scorer,
  SearchResults,
  Season,
  Standing,
  Suspension,
  Team,
  TeamDetail,
  TeamStanding,
} from "./types";
import { DEFAULT_ASSOCIATION, TENANT_HEADER, isAssociationSlug } from "./tenant";

/** Where the browser reaches the API. Inlined at build time, like every
 *  NEXT_PUBLIC_ variable, so it has to be the public address — a container
 *  hostname here would ship to the reader and fail to resolve. */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** Where *this process* reaches the API.
 *
 *  Identical to API_URL when the site runs on a laptop, and deliberately not
 *  when it runs in a container next to the API: server components would
 *  otherwise leave the network to fetch from a public hostname that resolves
 *  back to the machine they are already on. Read at request time rather than
 *  inlined, because it must never reach the browser.
 */
const SERVER_API_URL =
  process.env.API_INTERNAL_URL?.replace(/\/$/, "") || API_URL;

/** The base for a fetch made from here, whichever side "here" is. */
const baseUrl = () =>
  typeof window === "undefined" ? SERVER_API_URL : API_URL;

/** The ΕΠΣ this request is for. See `tenant.ts` for where it comes from.
 *
 *  On the server it is the header `proxy.ts` set; outside a request (a build,
 *  a script) there is none and the default stands. In the browser it is the
 *  attribute the layout put on <html>. */
async function currentAssociation(): Promise<string> {
  if (typeof window !== "undefined") return browserAssociation();
  try {
    const { headers } = await import("next/headers");
    const value = (await headers()).get(TENANT_HEADER);
    return isAssociationSlug(value) ? value : DEFAULT_ASSOCIATION;
  } catch {
    return DEFAULT_ASSOCIATION;
  }
}

function browserAssociation(): string {
  if (typeof document === "undefined") return DEFAULT_ASSOCIATION;
  const value = document.documentElement.dataset.association;
  return isAssociationSlug(value) ? value : DEFAULT_ASSOCIATION;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions {
  /** Seconds before Next.js revalidates its cache. 0 disables caching, which is
   *  what live data wants. */
  revalidate?: number;
  searchParams?: Record<string, string | number | undefined>;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = new URL(
    `${baseUrl()}${path.replace(TENANT, await currentAssociation())}`,
  );
  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    next:
      options.revalidate === 0
        ? undefined
        : { revalidate: options.revalidate ?? 60 },
    cache: options.revalidate === 0 ? "no-store" : undefined,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new ApiError(response.status, path, await errorDetail(response));
  }

  return (await response.json()) as T;
}

/** The server's own words for a failure, when it sent any. FastAPI puts a
 *  sentence meant for the reader in `detail`; a validation error puts a list
 *  there instead, which is no use to anybody holding a phone. */
export async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return invalidFields(body.detail);
  } catch {
    // A non-JSON error body is not worth failing twice over.
  }
  return response.status === 429
    ? "Πολλές προσπάθειες σε λίγο χρόνο. Δοκίμασε ξανά σε λίγα λεπτά."
    : `Σφάλμα ${response.status}`;
}

/** What the secretary calls the fields a validation error can name. */
const FIELD_NAMES: Record<string, string> = {
  home_score: "σκορ γηπεδούχου",
  away_score: "σκορ φιλοξενούμενου",
  minute: "λεπτό",
  latitude: "γεωγρ. πλάτος",
  longitude: "γεωγρ. μήκος",
  kickoff_at: "ημερομηνία/ώρα",
  name: "όνομα",
  email: "email",
  password: "κωδικός",
};

/** A 422 names the fields it rejected, as a list; "Σφάλμα 422" tells the
 *  person who typed them nothing. */
function invalidFields(detail: unknown[]): string {
  const fields = [
    ...new Set(
      detail.map((item) => {
        const loc = (item as { loc?: unknown[] } | null)?.loc;
        return Array.isArray(loc) ? String(loc.at(-1) ?? "") : "";
      }),
    ),
  ].filter(Boolean);
  return fields.length
    ? `Μη έγκυρη τιμή: ${fields.map((key) => FIELD_NAMES[key] ?? key).join(", ")}.`
    : "Κάποια τιμή δεν είναι έγκυρη.";
}

/** Every call the browser makes to the API goes through here, so there is one
 *  error type to catch and one place that reads the server's message.
 *
 *  `credentials: "include"` only for the dashboard and the volunteer screen,
 *  whose session is an httpOnly cookie on the API's origin — without it the
 *  cookie is not sent cross-origin and every call is a 401 that looks like a
 *  login problem. Public calls leave it off.
 */
export async function apiFetch<T>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      // A base, so a same-origin deployment with a relative API_URL works too.
      new URL(url, "http://localhost").pathname,
      await errorDetail(response),
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** For `useSWR(url, jsonFetcher)`. */
export const jsonFetcher = <T,>(url: string) => apiFetch<T>(url);

/** Stands in for the tenant until `request` knows which one it is. */
const TENANT = ":tenant";
const scoped = (path: string) => `/api/v1/${TENANT}${path}`;

export const api = {
  listAssociations: () => request<Association[]>("/api/v1/associations"),

  getAssociation: () => request<Association>(scoped("")),

  listSeasons: () => request<Season[]>(scoped("/seasons")),

  listLeagues: (season?: string) =>
    request<League[]>(scoped("/leagues"), { searchParams: { season } }),

  getLeague: (leagueSlug: string, season?: string) =>
    request<League>(scoped(`/leagues/${leagueSlug}`), {
      searchParams: { season },
    }),

  getStandings: (leagueSlug: string, season?: string) =>
    request<Standing[]>(scoped(`/leagues/${leagueSlug}/standings`), {
      searchParams: { season },
    }),

  listMatches: (
    leagueSlug: string,
    params: { matchday?: number; status?: MatchStatus; season?: string } = {},
  ) =>
    request<Match[]>(scoped(`/leagues/${leagueSlug}/matches`), {
      searchParams: {
        matchday: params.matchday,
        status: params.status,
        season: params.season,
      },
    }),

  // Never cached: this is the endpoint the live strip polls.
  listLiveMatches: () =>
    request<Match[]>(scoped("/matches/live"), { revalidate: 0 }),

  listTeams: (q?: string) =>
    request<Team[]>(scoped("/teams"), { searchParams: { q } }),

  getTeam: (teamSlug: string) =>
    request<TeamDetail>(scoped(`/teams/${teamSlug}`)),

  /** Which division the club plays in and its row there, or null. */
  getTeamStanding: (teamSlug: string, season?: string) =>
    request<TeamStanding | null>(scoped(`/teams/${teamSlug}/standing`), {
      searchParams: { season },
    }),

  getTeamMatches: (teamSlug: string, season?: string) =>
    request<Match[]>(scoped(`/teams/${teamSlug}/matches`), {
      searchParams: { season },
    }),

  listFields: (q?: string) =>
    request<Field[]>(scoped("/fields"), { searchParams: { q } }),

  getField: (fieldSlug: string) =>
    request<FieldDetail>(scoped(`/fields/${fieldSlug}`)),

  getFieldMatches: (fieldSlug: string, season?: string) =>
    request<Match[]>(scoped(`/fields/${fieldSlug}/matches`), {
      searchParams: { season },
    }),

  getLiveStandings: (leagueSlug: string) =>
    request<LiveTable>(scoped(`/leagues/${leagueSlug}/standings/live`), {
      revalidate: 0,
    }),

  listScorers: (leagueSlug: string, params: { season?: string; limit?: number } = {}) =>
    request<Scorer[]>(scoped(`/leagues/${leagueSlug}/scorers`), {
      searchParams: { season: params.season, limit: params.limit },
    }),

  // Not cached: a match page is opened to see the score now, and a minute-old
  // copy put a header saying 5–2 above a log saying 6–2.
  getMatch: (matchId: number) =>
    request<MatchDetail>(scoped(`/matches/${matchId}`), { revalidate: 0 }),

  searchPlayers: (q: string, limit = 30) =>
    request<PlayerSearchResult[]>(scoped("/players"), {
      searchParams: { q, limit },
    }),

  getPlayer: (playerSlug: string) =>
    request<PlayerDetail>(scoped(`/players/${playerSlug}`)),

  compareTeams: (left: string, right: string, season?: string) =>
    request<Comparison>(scoped(`/sygkrisi/${left}/${right}`), {
      searchParams: { season },
    }),

  getHeadToHead: (homeSlug: string, awaySlug: string) =>
    request<HeadToHead>(scoped(`/kontra/${homeSlug}/${awaySlug}`)),

  // Revalidated hourly rather than per request: the answer only changes when
  // the calendar day does, and it is the same for every reader.
  getOnThisDay: () => request<OnThisDay>(scoped("/san-simera"), { revalidate: 3600 }),

  getRecords: () => request<Records>(scoped("/rekor"), { revalidate: 3600 }),

  listAnnouncements: (params: { q?: string; limit?: number } = {}) =>
    request<Announcement[]>(scoped("/anakoinoseis"), { searchParams: params }),

  listSuspensions: (params: { season?: string; league?: string } = {}) =>
    request<Suspension[]>(scoped("/poines"), { searchParams: params }),

  /** One box over clubs, players and grounds.
   *
   *  Uncached: the URL carries the query, so caching would fill Next's data
   *  cache with one entry per thing anybody ever typed — including every
   *  prefix of it, since the box searches as you type.
   */
  search: (q: string) =>
    request<SearchResults>(scoped("/search"), {
      searchParams: { q },
      revalidate: 0,
    }),

  getMeta: () => request<Meta>(scoped("/meta"), { revalidate: 0 }),
};

/** A URL handed to the browser to fetch for itself — the live-score poll.
 *  API_URL, never the internal one: this string ends up in the page. */
export const apiUrl = (path: string) =>
  `${API_URL}/api/v1/${browserAssociation()}${path}`;

/** The subscribable calendar for a club.
 *
 *  Public API_URL for the same reason: it is put in front of a reader to add
 *  to their own calendar, and their phone has to be able to reach it.
 */
export const calendarUrl = (teamSlug: string) =>
  apiUrl(`/teams/${teamSlug}/imerologio.ics`);
