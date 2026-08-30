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

/** Which αγωνιστική to show: ?agonistiki=, else the league's current one. */
export function resolveMatchday(
  params: Record<string, string | string[] | undefined>,
  league: League,
): number {
  const raw = readParam(params, "agonistiki");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isInteger(parsed) && parsed >= 1) {
    return league.total_matchdays
      ? Math.min(parsed, league.total_matchdays)
      : parsed;
  }
  return league.current_matchday ?? 1;
}
