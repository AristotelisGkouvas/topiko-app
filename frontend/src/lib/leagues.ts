import { api } from "./api";
import type { League, Season } from "./types";

/** Next 15 hands search params in as a promise. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export interface LeagueContext {
  seasons: Season[];
  /** The season slug to pass on to the API, or undefined for the current one. */
  season: string | undefined;
  leagues: League[];
  league: League | null;
}

/**
 * Resolve which season and league a page is showing, from ?periodos= and
 * ?liga=.
 *
 * Season comes first because the league list depends on it: league slugs are
 * only unique *within* a season — six seasons each have a
 * "stefanos-gerasis-k10-a" — so every later call has to carry the season too,
 * or the API resolves the slug against the current one and 404s.
 *
 * An unknown ?periodos= falls back to the current season rather than erroring:
 * a stale link should still show football.
 */
export async function resolveLeague(
  params: Record<string, string | string[] | undefined>,
): Promise<LeagueContext> {
  const seasons = await api.listSeasons();
  const wantedSeason = readParam(params, "periodos");
  const season = seasons.some((s) => s.slug === wantedSeason)
    ? wantedSeason
    : undefined;

  const leagues = await api.listLeagues(season);
  const wanted = readParam(params, "liga");
  const league = leagues.find((l) => l.slug === wanted) ?? leagues[0] ?? null;
  return { seasons, season, leagues, league };
}

/**
 * Which αγωνιστική to show: ?agonistiki=, else a default per page.
 *
 * The results page opens on what was just played, the fixtures page on what
 * comes next. Only that default differs — the clamping does not, and when the
 * fixtures page carried its own copy of this it let ?agonistiki=99 through to
 * an API call that could only come back empty.
 */
export function resolveMatchday(
  params: Record<string, string | string[] | undefined>,
  league: League,
  which: "played" | "next" = "played",
): number {
  const total = league.total_matchdays;
  const clamp = (n: number) => Math.max(1, total ? Math.min(n, total) : n);

  const raw = readParam(params, "agonistiki");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isInteger(parsed) && parsed >= 1) return clamp(parsed);

  const played = league.current_matchday ?? 0;
  return clamp(which === "next" ? played + 1 : played || 1);
}

/** The competition as a reader knows it. `name` is the federation's published
 *  title, which leads with a sponsor — "ΣΤΕΦΑΝΟΣ ΓΕΡΑΣΗΣ Κ10 Α" — and puts it
 *  in the page heading. `short_name` is what the tabs already show. */
export const leagueLabel = (league: Pick<League, "name" | "short_name">) =>
  league.short_name ?? league.name;
