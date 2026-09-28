"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";

import { apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import { useFavourite, useHydrated } from "@/lib/favourite";
import { dismissInvite, useInviteDismissed } from "@/lib/onboarding";
import { rememberLeague, rememberedLeagueInBrowser } from "@/lib/leagueCookie";
import { formatDayDate, formatKickoff, plural } from "@/lib/format";
import type { Match, TeamRef, TeamStanding } from "@/lib/types";
import { Crest } from "./Crest";
import { ScoreFlash } from "./ScoreFlash";
import styles from "./MyClub.module.css";
import { pollEvery } from "@/lib/network";

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
export function MyClub({
  clubs = [],
  leagueName,
}: {
  /** The clubs of the division on screen, offered when nobody is followed. */
  clubs?: TeamRef[];
  leagueName?: string;
}) {
  const { favourite, toggle } = useFavourite();
  const hydrated = useHydrated();
  const dismissed = useInviteDismissed();
  // Set when a club is picked from the invitation on this page, so the club
  // card that replaces it fades in. Only then: on an ordinary visit the card
  // is simply there, every day, and must not animate.
  const [justPicked, setJustPicked] = useState(false);

  const { data } = useSWR<ClubForm>(
    favourite ? apiUrl(`/teams/${favourite.slug}/matches`) : null,
    fetchForm,
  );
  // While the club plays, poll the small live list (one or two matches), not
  // the club's whole season — 13 KB every 20 seconds on a 3G allowance.
  // Same key as the home page's live strip, so it is one request for both.
  // A goal for the reader's club is announced out loud (assertive), and only
  // theirs: the rest of the league's goals would be noise. Compared in the
  // fetch callback, not in an effect, so it fires once per new score.
  const lastScore = useRef<Record<number, number>>({});
  const [goalNews, setGoalNews] = useState("");
  const { data: liveList } = useSWR<Match[]>(
    data?.live ? apiUrl("/matches/live") : null,
    jsonFetcher,
    {
      refreshInterval: () => pollEvery(20_000),
      onSuccess: (list) => {
        const mine = list.find((m) => m.id === data?.live?.id);
        if (!mine || !favourite) return;
        const ours = mine.home_team.slug === favourite.slug ? mine.home_score : mine.away_score;
        const before = lastScore.current[mine.id];
        lastScore.current[mine.id] = ours ?? 0;
        if (before !== undefined && (ours ?? 0) > before) {
          setGoalNews(
            `Γκολ για ${favourite.name}! ${mine.home_team.name} ${mine.home_score}, ${mine.away_team.name} ${mine.away_score}.`,
          );
        }
      },
    },
  );
  const router = useRouter();
  const { data: placement } = useSWR<TeamStanding | null>(
    favourite ? apiUrl(`/teams/${favourite.slug}/standing`) : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      // Somebody who chose their club before the division followed it, and
      // never picked one in the header, still gets the Α΄ under their Β΄ club.
      // Once: afterwards the cookie exists and a header choice stands.
      onSuccess: (found) => {
        if (found && !rememberedLeagueInBrowser()) {
          rememberLeague(found.league.slug);
          router.refresh();
        }
      },
    },
  );

  // Nothing at all until the browser has been read. Rendering the invitation
  // first and replacing it a tick later makes every load flicker for the
  // people who already follow somebody.
  if (!hydrated) return null;

  if (!favourite) {
    // "Όχι τώρα" is an answer, and it holds: the question does not come back
    // on every visit to somebody who follows no single club.
    if (dismissed) return null;
    return (
      <ClubInvite
        clubs={clubs}
        leagueName={leagueName}
        onPick={(team) => {
          setJustPicked(true);
          toggle({ slug: team.slug, name: team.name });
        }}
      />
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

  // The whole card as one sentence, for TalkBack and VoiceOver: position,
  // what is happening now, the last result and the next match — read in one
  // go instead of crest, name, "vs", crest, name.
  const vs = (m: Match) => `${m.home_team.name} – ${m.away_team.name}`;
  const summary = [
    `Η ομάδα σου, ${favourite.name}`,
    placement ? `${placement.standing.position}η θέση με ${placement.standing.points} ${plural(placement.standing.points, "βαθμό", "βαθμούς")}` : null,
    live
      ? `Παίζει τώρα: ${live.home_team.name} ${live.home_score ?? 0}, ${live.away_team.name} ${live.away_score ?? 0}${live.minute ? `, ${live.minute}ο λεπτό` : ""}`
      : null,
    last && last !== live
      ? `Τελευταίο αποτέλεσμα: ${last.home_team.name} ${last.home_score}, ${last.away_team.name} ${last.away_score}`
      : null,
    next && !live
      ? `Επόμενος αγώνας: ${vs(next)}, ${formatKickoff(next.kickoff_at, " ")}${next.field ? `, ${next.field.name}` : ""}`
      : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <section className={`${styles.wrap} ${justPicked ? styles.arrive : ""}`}>
      <p className="srOnly">{summary}.</p>
      <p className="srOnly" role="alert" aria-live="assertive">
        {goalNews}
      </p>
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
                  ? formatKickoff(shown.kickoff_at)
                  : "Χωρίς ώρα"}
              </span>
            )}
            {shown.matchday !== null && <span>{shown.matchday}η ΑΓΩΝ.</span>}
          </div>

          <div className={styles.fixture}>
            <Side team={shown.home_team} />
            <span className={styles.vs}>
              {shown.home_score !== null && shown.away_score !== null ? (
                <>
                  <ScoreFlash value={shown.home_score} />–<ScoreFlash value={shown.away_score} />
                </>
              ) : (
                "vs"
              )}
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

/** No club followed yet: the division's clubs, one tap each.
 *
 *  It used to say "pick your club with the star on the club's page" and link
 *  to the list of clubs: three taps and a search for what most readers can do
 *  from here. Picking writes to the same store as that star, so the card
 *  turns into the reader's club card the moment one is pressed. */
function ClubInvite({
  clubs,
  leagueName,
  onPick,
}: {
  clubs: TeamRef[];
  leagueName?: string;
  onPick: (team: TeamRef) => void;
}) {
  return (
    <section className={styles.invite} aria-labelledby="invite-title">
      <div className={styles.inviteHead}>
        <h2 id="invite-title" className={styles.inviteTitle}>
          Ποια είναι η ομάδα σου;
        </h2>
        <p className={styles.inviteText}>
          Θα τη βλέπεις πρώτη εδώ: επόμενος αγώνας, θέση, αποτελέσματα.
        </p>
      </div>
      {clubs.length > 0 && (
        <ul className={styles.inviteClubs} aria-label={leagueName ? `Σωματεία ${leagueName}` : "Σωματεία"}>
          {clubs.map((team) => (
            <li key={team.slug}>
              <button type="button" className={styles.inviteClub} onClick={() => onPick(team)}>
                <Crest team={team} size="xs" />
                <span className={styles.inviteClubName}>{team.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.inviteFoot}>
        <Link href="/somateia" className={styles.inviteLink}>
          Άλλη κατηγορία ›
        </Link>
        <button type="button" className={styles.inviteLater} onClick={dismissInvite}>
          Όχι τώρα
        </button>
      </div>
    </section>
  );
}
