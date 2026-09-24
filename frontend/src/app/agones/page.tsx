import type { Metadata } from "next";
import Link from "next/link";

import { LeagueChips } from "@/components/LeagueChips";
import { MatchRow } from "@/components/MatchRow";
import { MatchdayStrip } from "@/components/MatchdayStrip";
import { PageHeader, PageHeaderStepper } from "@/components/PageHeader";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { formatDayDate, upper } from "@/lib/format";
import { resolveLeague, resolveMatchday, type SearchParams } from "@/lib/leagues";
import type { Match } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Αγώνες",
  description: "Το πρόγραμμα και τα αποτελέσματα κάθε αγωνιστικής.",
};

/** Matches by matchday, grouped by the day they are played.
 *
 *  One page, not two. The site used to have "Αποτελέσματα" and "Πρόγραμμα" as
 *  separate destinations, which made the reader choose before they were allowed
 *  to look — and for most of a weekend the right answer is "both", because half
 *  the round has been played and half has not.
 */
export default async function MatchesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const { leagues, league } = await resolveLeague(params);

  if (!league) {
    return (
      <>
        <PageHeader title="Αγώνες" />
        <Empty
          title="Καμία διοργάνωση"
          body="Δεν έχει δημοσιευτεί πρωτάθλημα για αυτή την περίοδο."
        />
      </>
    );
  }

  // Opens on the round the league is on, which for most of a weekend is half
  // result and half fixture — the reason the two pages became one.
  const matchday = resolveMatchday(params, league);
  const matches = await api.listMatches(league.slug, { matchday });

  const days = groupByDay(matches);
  const span = dateSpan(matches);
  const total = league.total_matchdays;

  const href = (n: number) => `/agones?liga=${league.slug}&agonistiki=${n}`;

  return (
    <>
      <PageHeader
        title="Αγώνες"
        aside={span}
        controls={
          <PageHeaderStepper
            label={`${matchday}η αγωνιστική`}
            previous={
              matchday > 1
                ? { href: href(matchday - 1), label: "Προηγούμενη αγωνιστική" }
                : undefined
            }
            next={
              total === null || matchday < total
                ? { href: href(matchday + 1), label: "Επόμενη αγωνιστική" }
                : undefined
            }
          />
        }
      />

      <div className={styles.page}>
        <LeagueChips leagues={leagues} active={league.slug} basePath="/agones" />

        {/* Wide screens get the whole season at once. The stepper still works,
            but walking from the 2nd round to the 24th two taps at a time is
            not something a mouse should have to do. */}
        {total !== null && total > 1 && (
          <MatchdayStrip
            total={total}
            active={matchday}
            href={href}
            current={league.current_matchday}
          />
        )}

        {days.length === 0 ? (
          <Empty
            title="Καμία αναμέτρηση"
            body={`Το πρόγραμμα της ${matchday}ης αγωνιστικής δεν έχει ανακοινωθεί ακόμη.`}
          />
        ) : (
          <div className={styles.days}>
            {days.map(([day, dayMatches]) => (
              <section key={day} className={styles.day}>
                <p className={styles.dayLabel}>{day}</p>
                <div className={styles.card}>
                  {dayMatches.map((match, i) => (
                    <MatchRow
                      key={match.id}
                      match={match}
                      last={i === dayMatches.length - 1}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className={styles.note}>
          Οι διαιτητές φαίνονται στη σελίδα του κάθε αγώνα.{" "}
          <Link href={`/vathmologia?liga=${league.slug}`}>Βαθμολογία ›</Link>
        </p>
      </div>
    </>
  );
}

/** Matches bucketed under a day heading, in kickoff order.
 *
 *  A Map, so the first time a day is seen fixes its position — the matches
 *  arrive sorted by kickoff, and sorting the days separately afterwards would
 *  be a second ordering to keep in step with the first.
 */
function groupByDay(matches: Match[]): [string, Match[]][] {
  const days = new Map<string, Match[]>();
  for (const match of matches) {
    const label = match.kickoff_at
      ? upper(formatDayDate(match.kickoff_at))
      : "ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ";
    const bucket = days.get(label);
    if (bucket) bucket.push(match);
    else days.set(label, [match]);
  }
  return [...days];
}

/** "19–20/09" — what the header prints beside the round number. */
function dateSpan(matches: Match[]): string | undefined {
  const dates = matches
    .map((m) => m.kickoff_at)
    .filter((d): d is string => d !== null)
    .sort();
  if (dates.length === 0) return undefined;

  const day = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const first = day(dates[0]);
  const last = day(dates[dates.length - 1]);
  return first === last ? first : `${first}–${last}`;
}
