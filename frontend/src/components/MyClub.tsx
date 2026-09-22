"use client";

import Link from "next/link";
import useSWR from "swr";

import { apiUrl } from "@/lib/api";
import { useFavourite, useHydrated } from "@/lib/favourite";
import { formatDayDate, formatTime } from "@/lib/format";
import type { Match } from "@/lib/types";
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

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.label}>Η ομάδα σου</span>
        <Link href={`/somateia/${favourite.slug}`} className={styles.name}>
          {favourite.name}
        </Link>
      </div>

      <div className={styles.slots}>
        <Slot title="Τελευταίο">
          {last ? (
            <Link href={`/agones/${last.id}`} className={styles.match}>
              <span className={styles.opponent}>
                {opponentOf(last, favourite.name)}
              </span>
              <span className={styles.score}>
                {last.home_score}–{last.away_score}
              </span>
            </Link>
          ) : (
            <span className={styles.none}>—</span>
          )}
        </Slot>

        <Slot title="Επόμενο">
          {next ? (
            <Link href={`/agones/${next.id}`} className={styles.match}>
              <span className={styles.opponent}>
                {opponentOf(next, favourite.name)}
              </span>
              <span className={styles.when}>
                {formatDayDate(next.kickoff_at)} · {formatTime(next.kickoff_at)}
              </span>
            </Link>
          ) : (
            <span className={styles.none}>χωρίς ορισμένο αγώνα</span>
          )}
        </Slot>
      </div>
    </section>
  );
}

function Slot({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.slot}>
      <span className={styles.slotTitle}>{title}</span>
      {children}
    </div>
  );
}

/** Which side of the fixture is not us.
 *
 *  Compared on the stored name rather than an id: the panel knows the club
 *  only by what was saved when the star was pressed, and refetching the club
 *  to learn its id would cost a request to answer a question the name settles.
 */
function opponentOf(match: Match, ours: string): string {
  return match.home_team.name === ours
    ? match.away_team.name
    : match.home_team.name;
}
