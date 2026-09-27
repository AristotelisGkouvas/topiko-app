/** The cookie that remembers which division a reader is looking at.
 *
 *  In a module of its own because both halves need it and they cannot share a
 *  file: the server half of `leagues.ts` imports `next/headers`, and a client
 *  component that imports anything from there drags that server-only API into
 *  the browser bundle and fails the build.
 */
export const LEAGUE_COOKIE = "ps_league";

/** Write the division down for the next request. Browser only.
 *
 *  A year: long enough that somebody who visits every Sunday never chooses
 *  twice, short enough to lapse for somebody who has moved on. */
export function rememberLeague(slug: string) {
  try {
    document.cookie = `${LEAGUE_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked: the choice lasts for this page only.
  }
}

/** The remembered division, read in the browser. */
export function rememberedLeagueInBrowser(): string | undefined {
  try {
    const hit = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LEAGUE_COOKIE}=`));
    return hit ? decodeURIComponent(hit.slice(LEAGUE_COOKIE.length + 1)) : undefined;
  } catch {
    return undefined;
  }
}
