"use client";

import Link from "next/link";
import useSWR from "swr";

import { apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import { useFavourite, useHydrated } from "@/lib/favourite";
import { useWelcomed } from "@/lib/onboarding";
import { formatDayDate, formatTime } from "@/lib/format";
import type { Match } from "@/lib/types";
import { Crest } from "./Crest";
import styles from "./MyClub.module.css";

interface ClubForm {
  live?: Match;
  last?: Match;
  next?: Match;
}

/** Fetch the club's fixtures and pick out the two that matter.
 *
 *  The clock is read here rather than while rendering. `Date.now()` during
 *  render is impure — two renders of the same data could disagree about which
 *  fixture is next — and this function already runs outside it.
 */
const fetchForm = async (url: string): Promise<ClubForm> => {
  const matches = await apiFetch<Match[]>(url);

  const now = Date.now();
  // A match in progress outranks everything: the reader who follows the club
  // wants the score now, not next Sunday's fixture.
  const live = matches.find((m) => m.is_live);
  const played = matches.filter(
    (m) => m.home_score !== null && m.away_score !== null,
  );
  // Kickoff time decides what is still to come: whole youth divisions are
  // never scored, so "no score" alone would offer a fixture from 2016.
  const next = matches.find(
    (m) =>
      m.home_score === null &&
      m.status !== "cancelled" &&
      m.kickoff_at !== null &&
      new Date(m.kickoff_at).getTime() >= now,
  );

  return { live, last: played[played.length - 1], next };
};

/** The reader's own club, at the top of the home page.
 *
 *  Client-side because the answer lives in this browser: the server has no
 *  idea who is asking, and a personalised panel rendered on the server would
 *  either need an account or poison the cache for everyone else.
 */
export function MyClub() {
  const { favourite } = useFavourite();
  const hydrated = useHydrated();
  const welcomed = useWelcomed();

  const { data } = useSWR<ClubForm>(
    favourite ? apiUrl(`/teams/${favourite.slug}/matches`) : null,
    fetchForm,
  );
  // While the club plays, poll the small live list (one or two matches), not
  // the club's whole season — 13 KB every 20 seconds on a 3G allowance.
  // Same key as the home page's live strip, so it is one request for both.
  const { data: liveList } = useSWR<Match[]>(
    data?.live ? apiUrl("/matches/live") : null,
    jsonFetcher,
    { refreshInterval: 20_000 },
  );

  // Nothing at all until the browser has been read. Rendering the invitation
  // first and replacing it a tick later makes every load flicker for the
  // people who already follow somebody.
  if (!hydrated) return null;

  // The welcome card above asks the same question; two "pick your club"
  // boxes one under the other read as a glitch. It wins until dismissed.
  if (!favourite && !welcomed) return null;

  if (!favourite) {
    return (
      <section className={styles.invite}>
        <p className={styles.inviteText}>
          Διάλεξε την ομάδα σου με το <span aria-hidden="true">☆</span> στη
          σελίδα του σωματείου, και θα σε περιμένει εδώ.
        </p>
        <Link href="/somateia" className={styles.inviteLink}>
          Δες τα σωματεία →
        </Link>
      </section>
    );
  }

  const live = data?.live
    ? (liveList?.find((m) => m.id === data.live!.id) ?? data.live)
    : undefined;
  const last = data?.last;
  const next = data?.next;

  // The design's card is the *next* fixture, crest against crest. Results have
  // their own section below it on the home page, so repeating the last one here
  // would be the same information twice. In June, when there is no next
  // fixture, the last result takes the slot rather than leaving a hole.
  const shown = live ?? next ?? last;

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>Η ΟΜΑΔΑ ΜΟΥ</span>
        <Link href={`/somateia/${favourite.slug}`} className={styles.more}>
          {favourite.name} ›
        </Link>
      </div>

      {shown ? (
        <Link href={`/agones/${shown.id}`} className={styles.card}>
          <div className={styles.meta}>
            {shown.is_live ? (
              <span className={styles.live}>
                {shown.status === "halftime"
                  ? "ΗΜΙΧΡΟΝΟ"
                  : shown.minute
                    ? `LIVE · ${shown.minute}′`
                    : "LIVE"}
              </span>
            ) : (
              <span>
                {shown.kickoff_at
                  ? `${formatDayDate(shown.kickoff_at)} · ${formatTime(shown.kickoff_at)}`
                  : "Χωρίς ώρα"}
              </span>
            )}
            {shown.matchday !== null && <span>{shown.matchday}η ΑΓΩΝ.</span>}
          </div>

          <div className={styles.fixture}>
            <Side team={shown.home_team} />
            <span className={styles.vs}>
              {shown.home_score !== null && shown.away_score !== null
                ? `${shown.home_score}–${shown.away_score}`
                : "vs"}
            </span>
            <Side team={shown.away_team} />
          </div>
        </Link>
      ) : (
        <div className={styles.card}>
          <p className={styles.none}>Χωρίς ορισμένο αγώνα.</p>
        </div>
      )}

      {/* Yesterday's result under next week's fixture: the card showed only
          what is coming, and the Monday reader wanted what happened. */}
      {shown && shown !== last && last && (
        <Link href={`/agones/${last.id}`} className={styles.lastResult}>
          Τελευταίο: {last.home_team.short_name ?? last.home_team.name}{" "}
          {last.home_score}–{last.away_score}{" "}
          {last.away_team.short_name ?? last.away_team.name}
          {last.kickoff_at ? ` · ${formatDayDate(last.kickoff_at)}` : ""}
        </Link>
      )}

      {/* The two things a club official checks midweek, one tap away. */}
      <nav className={styles.links} aria-label={`Για ${favourite.name}`}>
        {shown?.field && (
          <Link href={`/gipeda/${shown.field.slug}`}>Γήπεδο &amp; οδηγίες</Link>
        )}
        <Link href={`/poines?somateio=${favourite.slug}`}>Ποινές</Link>
        <Link href="/anakoinoseis">Ανακοινώσεις</Link>
      </nav>
    </section>
  );
}

/** One half of the fixture: a 42px crest above the club's short name. */
function Side({ team }: { team: Match["home_team"] }) {
  return (
    <span className={styles.side}>
      <span className={styles.sideCrest}>
        <Crest team={team} size="lg" />
      </span>
      <span className={styles.sideName}>{team.short_name ?? team.name}</span>
    </span>
  );
}
