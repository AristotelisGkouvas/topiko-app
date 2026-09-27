import type { MatchFeed } from "./types";

/** "16:05" typed on a kickoff entry: when the whistle actually went. */
export const CLOCK_NOTE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** When the match started, as the clock should count it.
 *
 *  The kickoff entry's own time, unless its note carries the real one — a
 *  volunteer who arrives at 16:20 and presses Σέντρα for a 16:00 start would
 *  otherwise put every goal twenty minutes early. Without any kickoff entry,
 *  the scheduled time, while the match could plausibly be running: a sheet
 *  opened mid-match with no Σέντρα pressed used to file every event with no
 *  minute at all. */
export function clockStart(
  feed: Pick<MatchFeed, "events">,
  scheduled: string | null,
  now: number,
): number | null {
  const kickoff = feed.events.find((e) => e.kind === "kickoff");
  const planned = scheduled ? new Date(scheduled).getTime() : null;
  if (kickoff) {
    const typed = kickoff.note?.trim().match(CLOCK_NOTE);
    let at = new Date(kickoff.created_at).getTime();
    if (typed) {
      const when = new Date(kickoff.created_at);
      when.setHours(Number(typed[1]), Number(typed[2]), 0, 0);
      at = when.getTime();
    }
    // A Σέντρα pressed hours before the scheduled start is a test tap or a
    // mistake, not the whistle: counting from it put the clock at 788′, and
    // every goal after that was refused by the server. The schedule wins.
    if (planned === null || at > planned - EARLY_KICKOFF_MS) return at;
  }
  if (planned === null) return null;
  const since = now - planned;
  return since > 0 && since < 3 * 60 * 60_000 ? planned : null;
}

/** How long before the scheduled time a Σέντρα still counts as the whistle. */
const EARLY_KICKOFF_MS = 60 * 60_000;
/** The highest minute the server accepts (schemas/events.py). */
const MAX_MINUTE = 130;

/** The minute to file an event at, from the log's markers and the clock. */
export function matchMinute(
  feed: Pick<MatchFeed, "events">,
  scheduled: string | null,
  now: number,
): number | null {
  // Where the match is now: the latest marker by entry order, not "has there
  // ever been a half time" — which froze the clock for the whole second half.
  const markers = feed.events.filter((e) =>
    ["kickoff", "halftime", "second_half", "fulltime"].includes(e.kind),
  );
  const latest = markers.length ? markers.reduce((a, b) => (b.id > a.id ? b : a)) : null;

  // Stopped: at the minute the marker itself was filed at.
  if (latest?.kind === "halftime") return latest.minute ?? 45;
  if (latest?.kind === "fulltime") return latest.minute ?? 90;

  let minute: number;
  if (latest?.kind === "second_half") {
    // The second half counts on from 46′, from when it was restarted.
    const restart = new Date(latest.created_at).getTime();
    minute = 45 + Math.max(1, Math.round((now - restart) / 60_000));
  } else {
    const start = clockStart(feed, scheduled, now);
    if (start === null) return null;
    minute = Math.max(1, Math.round((now - start) / 60_000));
  }
  // Past what any match lasts, the clock is wrong, not the match long: no
  // automatic minute at all is better than one the server will refuse.
  return minute <= MAX_MINUTE ? minute : null;
}

