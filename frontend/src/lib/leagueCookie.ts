/** The cookie that remembers which division a reader is looking at.
 *
 *  In a module of its own because both halves need it and they cannot share a
 *  file: the server half of `leagues.ts` imports `next/headers`, and a client
 *  component that imports anything from there drags that server-only API into
 *  the browser bundle and fails the build.
 */
export const LEAGUE_COOKIE = "ps_league";
