import type {
  Announcement,
  Association,
  Field,
  League,
  Comparison,
  HeadToHead,
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
  Season,
  Standing,
  Suspension,
  Team,
  TeamDetail,
} from "./types";

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

/**
 * Which ΕΠΣ this deployment serves.
 *
 * The backend is tenant-scoped by URL, but the reader-facing URLs are not:
 * pamesentra.gr/vathmologia reads better than
 * pamesentra.gr/epsip-ipeirou/vathmologia, and the design mockups show the
 * short form. So the tenant is resolved here and nowhere else. When a second
 * association arrives this is the one function that changes — to read the
 * subdomain from the request headers instead of the environment.
 */
export const ASSOCIATION =
  process.env.NEXT_PUBLIC_ASSOCIATION ?? "epsip-ipeirou";

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
  const url = new URL(`${baseUrl()}${path}`);
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
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // A non-JSON error body is not worth failing twice over.
    }
    throw new ApiError(response.status, path, detail);
  }

  return (await response.json()) as T;
}

const scoped = (path: string) => `/api/v1/${ASSOCIATION}${path}`;

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

  getTeamMatches: (teamSlug: string, season?: string) =>
    request<Match[]>(scoped(`/teams/${teamSlug}/matches`), {
      searchParams: { season },
    }),

  listFields: (q?: string) =>
    request<Field[]>(scoped("/fields"), { searchParams: { q } }),

  getField: (fieldSlug: string) => request<Field>(scoped(`/fields/${fieldSlug}`)),

  getLiveStandings: (leagueSlug: string) =>
    request<LiveTable>(scoped(`/leagues/${leagueSlug}/standings/live`), {
      revalidate: 0,
    }),

  listScorers: (leagueSlug: string, params: { season?: string; limit?: number } = {}) =>
    request<Scorer[]>(scoped(`/leagues/${leagueSlug}/scorers`), {
      searchParams: { season: params.season, limit: params.limit },
    }),

  getMatch: (matchId: number) =>
    request<MatchDetail>(scoped(`/matches/${matchId}`)),

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

  getMeta: () => request<Meta>(scoped("/meta"), { revalidate: 0 }),
};

/** Absolute URL for a path, for client-side fetchers that cannot use `api`. */
/** A URL handed to the browser to fetch for itself — the live-score poll.
 *  API_URL, never the internal one: this string ends up in the page. */
export const apiUrl = (path: string) => `${API_URL}${scoped(path)}`;

/** The subscribable calendar for a club.
 *
 *  Public API_URL for the same reason: it is put in front of a reader to add
 *  to their own calendar, and their phone has to be able to reach it.
 */
export const calendarUrl = (teamSlug: string) =>
  apiUrl(`/teams/${teamSlug}/imerologio.ics`);
