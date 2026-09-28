import type { Metadata } from "next";
import Link from "next/link";

import { AllLeagues } from "./AllLeagues";
import { ApiLink } from "@/components/ApiLink";
import { LeagueChips } from "@/components/LeagueChips";
import { MatchRow } from "@/components/MatchRow";
import { MatchdayStrip } from "@/components/MatchdayStrip";
import { MiniStandings } from "@/components/MiniStandings";
import { SectionHeader } from "@/components/SectionHeader";
import { PageHeader, PageHeaderStepper } from "@/components/PageHeader";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { formatDayDate, matchdayLabel, upper } from "@/lib/format";
import {
  readParam,
  resolveLeague,
  resolveMatchday,
  type SearchParams,
  leagueLabel,
} from "@/lib/leagues";
import type { Match } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/** Division and round in the title and the card — see vathmologia/page.tsx
 *  for why the card is a route named here rather than an opengraph-image. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const { league, season } = await resolveLeague(params);
  if (!league) return { title: "Αγώνες" };
  const matchday = resolveMatchday(params, league);
  const query = new URLSearchParams({ liga: league.slug, agonistiki: String(matchday) });
  if (season) query.set("periodos", season);
  const label = `${leagueLabel(league)} · ${matchdayLabel(matchday)}`;
  const image = { url: `/agones/karta?${query}`, width: 1200, height: 630, alt: label };
  return {
    title: `Αγώνες · ${label}`,
    description: `Πρόγραμμα και αποτελέσματα: ${label}, ΕΠΣ Ηπείρου.`,
    alternates: { canonical: `/agones?${query}` },
    openGraph: { images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

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

  // Every division for the weekend — what a reporter needs on a Sunday night
  // instead of fifteen separate pages.
  if (readParam(params, "liga") === "oles" && leagues.length > 1) {
    return (
      <>
        <PageHeader column="wide" title="Αγώνες" aside="Όλες οι κατηγορίες · Σαββατοκύριακο" />
        <div className={styles.page}>
          <LeagueChips leagues={leagues} active="oles" basePath="/agones" withAll />
          <AllLeagues leagues={leagues} />
        </div>
      </>
    );
  }

  if (!league) {
    return (
      <>
        <PageHeader column="wide" title="Αγώνες" />
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
  const [matches, standings] = await Promise.all([
    api.listMatches(league.slug, { matchday }),
    api.getStandings(league.slug),
  ]);

  const days = groupByDay(matches);
  const span = dateSpan(matches);
  const total = league.total_matchdays;

  const href = (n: number) => `/agones?liga=${league.slug}&agonistiki=${n}`;

  return (
    <>
      <PageHeader
        column="wide"
        title="Αγώνες"
        aside={span}
        controls={
          // On a wide screen the strip below shows every round, so the
          // stepper would be a second control for the same thing.
          <div className={total !== null && total > 1 ? styles.phoneOnly : undefined}>
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
          </div>
        }
      />

      <div className={styles.page}>
        <LeagueChips leagues={leagues} active={league.slug} basePath="/agones" withAll />

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

        {/* One column of days, with the table beside it on a wide screen.
            The days used to sit side by side, and a round is rarely split
            evenly: one Saturday match beside six on Sunday left a hole the
            height of the page. */}
        <div className={styles.split}>
          <div className={styles.listColumn}>
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
          </div>
          {standings.length > 0 && (
            <aside className={styles.side} aria-labelledby="table-heading">
              <SectionHeader id="table-heading" title="ΒΑΘΜΟΛΟΓΙΑ" />
              <MiniStandings standings={standings} league={league} />
            </aside>
          )}
        </div>

        {/* Two onward links, as rows: a sentence of footnote with "›", "·"
            and "(.ics)" strung together read as a typo. */}
        <nav className={styles.links} aria-label="Σχετικά">
          <Link href={`/vathmologia?liga=${league.slug}`} className={styles.linkRow}>
            <span>Βαθμολογία {leagueLabel(league)}</span>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </Link>
          <ApiLink
            path={`/leagues/${league.slug}/imerologio.ics`}
            className={styles.linkRow}
          >
            <span>Όλο το πρόγραμμα στο ημερολόγιό σου</span>
            <span className={styles.chevron} aria-hidden="true">›</span>
          </ApiLink>
        </nav>
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
