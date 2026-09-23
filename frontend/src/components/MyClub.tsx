"use client";

import Link from "next/link";
import useSWR from "swr";

import { apiUrl } from "@/lib/api";
import { useFavourite, useHydrated } from "@/lib/favourite";
import { formatDayDate, formatTime } from "@/lib/format";
import type { Match } from "@/lib/types";
import { Crest } from "./Crest";
import styles from "./MyClub.module.css";

interface ClubForm {
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
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  const matches: Match[] = await response.json();

  const now = Date.now();
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

  return { last: played[played.length - 1], next };
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

  const { data } = useSWR<ClubForm>(
    favourite ? apiUrl(`/teams/${favourite.slug}/matches`) : null,
    fetchForm,
  );

  // Nothing at all until the browser has been read. Rendering the invitation
  // first and replacing it a tick later makes every load flicker for the
  // people who already follow somebody.
  if (!hydrated) return null;

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

  const last = data?.last;
  const next = data?.next;

  // The design's card is the *next* fixture, crest against crest. Results have
  // their own section below it on the home page, so repeating the last one here
  // would be the same information twice. In June, when there is no next
  // fixture, the last result takes the slot rather than leaving a hole.
  const shown = next ?? last;

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
            <span>
              {shown.kickoff_at
                ? `${formatDayDate(shown.kickoff_at)} · ${formatTime(shown.kickoff_at)}`
                : "Χωρίς ώρα"}
            </span>
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
