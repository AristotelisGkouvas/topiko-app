import { api } from "./api";
import type { League } from "./types";

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
  leagues: League[];
  league: League | null;
}

/**
 * Resolve which league a page is showing from ?liga=, falling back to the first
 * one the association publishes (leagues come back ordered by tier).
 */
export async function resolveLeague(
  params: Record<string, string | string[] | undefined>,
): Promise<LeagueContext> {
  const leagues = await api.listLeagues();
  const wanted = readParam(params, "liga");
  const league =
    leagues.find((l) => l.slug === wanted) ?? leagues[0] ?? null;
  return { leagues, league };
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
