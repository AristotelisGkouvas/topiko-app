import { HomeTeasers } from "@/components/HomeTeasers";
import { HomeSponsor } from "@/components/HomeSponsor";
import { Intro } from "@/components/Intro";
import { LastUpdated } from "@/components/LastUpdated";
import { LiveMatches } from "@/components/LiveMatches";
import { MyClub } from "@/components/MyClub";
import { MatchRow } from "@/components/MatchRow";
import { SectionHeader } from "@/components/SectionHeader";
import { LeagueRail } from "@/components/LeagueRail";
import { MiniStandings } from "@/components/MiniStandings";
import { ScorerRail } from "@/components/ScorerRail";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayGenitive } from "@/lib/format";
import { resolveLeague, resolveMatchday, type SearchParams } from "@/lib/leagues";
import type { League, Match, Scorer, Standing } from "@/lib/types";
import { JsonLd, SITE } from "@/lib/seo";
import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeSkeleton } from "./HomeSkeleton";
import styles from "./page.module.css";

/** What a search for "βαθμολογία ΕΠΣ Ηπείρου" should find: the words people
 *  type, not the tagline. ?liga= variants of the home page fold into "/". */
export const metadata: Metadata = {
  title: { absolute: "Πάμε Σέντρα · Αποτελέσματα και βαθμολογίες ΕΠΣ Ηπείρου" },
  description:
    "Αποτελέσματα, βαθμολογίες, πρόγραμμα και σκόρερ σε όλες τις κατηγορίες της ΕΠΣ Ηπείρου, live την ώρα του αγώνα. Κάθε ομάδα, κάθε γήπεδο.",
  alternates: { canonical: "/" },
};

/** Lets Google put a search box under the result, straight into /anazitisi. */
const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Πάμε Σέντρα",
  url: `${SITE}/`,
  inLanguage: "el",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE}/anazitisi?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

/** Live scores mean the home page can never be statically cached. */
export const dynamic = "force-dynamic";

/** The page streams: the skeleton goes out at once, the data follows. It is
 *  the most visited page and waits on five API calls, and with nothing to
 *  show in between, a tap on "Αρχική" over 3G looked like a tap that had not
 *  registered. A Suspense boundary rather than a loading.tsx, which here at
 *  the root would also stand in for every page that has none of its own. */
export default function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const [{ leagues, league }, meta] = await Promise.all([
    // The home screen is about today — live scores and the next αγωνιστική —
    // so it stays on the current season even if ?periodos= is in the URL.
    // Honouring it here would show a 2016 table beside a live strip.
    resolveLeague({ ...params, periodos: undefined }),
    api.getMeta(),
  ]);

  if (!league) {
    return (
      <div className={styles.page}>
        <h1>Πάμε Σέντρα</h1>
        <Empty
          title="Καμία διοργάνωση ακόμη"
          body="Δεν έχει δημοσιευτεί πρωτάθλημα για την τρέχουσα περίοδο."
        />
      </div>
    );
  }

  const played = league.current_matchday ?? 0;
  const total = league.total_matchdays;
  // Between seasons there is no next αγωνιστική, and asking for one leaves the
  // home screen showing a table and an empty box. Fall back to the last round
  // played, which is what a reader wants in the summer anyway.
  const seasonOver = total !== null && played >= total;
  const nextMatchday = seasonOver ? played : played + 1;

  // The rail's ‹ › picks a round (?agonistiki=). Then that round is the page:
  // one list, titled by whether it has been played. Otherwise the handoff's
  // order: the round just played, then the one coming.
  const picked = params.agonistiki ? resolveMatchday(params, league) : null;
  const rounds: number[] = picked
    ? [picked]
    : played > 0 && !seasonOver
      ? [played, nextMatchday]
      : [nextMatchday];

  const [live, standings, scorers, ...lists] = await Promise.all([
    api.listLiveMatches(),
    api.getStandings(league.slug),
    api.listScorers(league.slug, { limit: 4 }),
    ...rounds.map((n) => api.listMatches(league.slug, { matchday: n })),
  ]);
  const railMatchday = picked ?? nextMatchday;

  // The invitation offers the division's clubs by name, so a reader finds
  // their village alphabetically rather than by where it sits in the table.
  const clubs = standings
    .map((row) => row.team)
    .sort((a, b) => a.name.localeCompare(b.name, "el"));

  return (
    <div className={`${styles.page} ${styles.home}`}>
      <JsonLd data={WEBSITE_LD} />
      <Intro />
      <h1 className="srOnly">Πάμε Σέντρα · {league.name}</h1>
      {/* Screen D01's three columns: division rail, the page, the numbers.
          One column on a phone, where the rail's job belongs to the header
          chip and the right-hand numbers come after the results. */}
      <LeagueRail
        leagues={leagues}
        active={league.slug}
        matchday={railMatchday}
        totalMatchdays={league.total_matchdays}
      />

      <div className={styles.main}>
        {/* The handoff's order (screen 01): the reader's club, what is being
            played now, what was just played, what comes next. The daily
            teasers follow the football instead of leading it: on a Monday
            the Sunday results are the news, not a score from 2020. */}
        <MyClub clubs={clubs} leagueName={league.name} />

        {/* Only when something is actually being played — an empty strip
            labelled "ΤΩΡΑ ΖΩΝΤΑΝΑ" reads as a broken feature. */}
        <LiveMatches initial={live} />

        {rounds.map((n, i) => (
          <Round key={n} league={league} matchday={n} matches={lists[i] as Match[]} />
        ))}

        <HomeTeasers />

        <HomeSponsor />
      </div>

      {/* Rendered once. On a phone the grid is one column, so this simply
          follows the results; on a wide screen it becomes the right-hand
          column beside them. */}
      <aside className={styles.side} aria-label="Βαθμολογία και σκόρερ">
        <Numbers standings={standings} scorers={scorers} league={league} />
        <div className={styles.wideOnly}>
          <LastUpdated
            timestamp={meta.last_scraped_at}
            sourceUrl={meta.source_url}
          />
        </div>
      </aside>
    </div>
  );
}

/** One αγωνιστική: results once any match has a score, a programme before. */
function Round({
  league,
  matchday,
  matches,
}: {
  league: League;
  matchday: number;
  matches: Match[];
}) {
  // "Results" over a list with no scores in it is a promise the list does not
  // keep; until the first final whistle the round is still a programme.
  const anyScored = matches.some(
    (m) => m.home_score !== null && m.away_score !== null,
  );
  const title = anyScored ? "ΑΠΟΤΕΛΕΣΜΑΤΑ" : "ΠΡΟΓΡΑΜΜΑ";
  const id = `round-${matchday}-heading`;

  return (
    <section className={styles.section} aria-labelledby={id}>
      <SectionHeader
        id={id}
        title={`${title} · ${matchday}η`}
        action={{
          href: `/agones?liga=${league.slug}&agonistiki=${matchday}`,
          label: "Όλα ›",
        }}
      />
      {matches.length > 0 ? (
        <div className={styles.card}>
          {matches.map((match, i) => (
            <MatchRow
              key={match.id}
              match={match}
              last={i === matches.length - 1}
              showDay
            />
          ))}
        </div>
      ) : (
        <Empty
          title="Καμία αναμέτρηση"
          body={`Το πρόγραμμα της ${matchdayGenitive(matchday)} δεν έχει ανακοινωθεί ακόμη.`}
          action={{
            href: `/agones?liga=${league.slug}`,
            label: "Δες τους αγώνες",
          }}
        />
      )}
    </section>
  );
}

/** The table preview and the scorers. */
function Numbers({
  standings,
  scorers,
  league,
}: {
  standings: Standing[];
  scorers: Scorer[];
  league: League;
}) {
  return (
    <>
      <section className={styles.section} aria-labelledby="standings-heading">
        <SectionHeader id="standings-heading" title="ΒΑΘΜΟΛΟΓΙΑ" />
        {standings.length > 0 ? (
          <MiniStandings standings={standings} league={league} />
        ) : (
          <Empty
            title="Χωρίς βαθμολογία"
            body="Η βαθμολογία εμφανίζεται μόλις παιχτεί η πρώτη αγωνιστική."
          />
        )}
      </section>
      {scorers.length > 0 && (
        <section className={styles.section} aria-labelledby="scorers-heading">
          <SectionHeader id="scorers-heading" title="ΣΚΟΡΕΡ" />
          <ScorerRail scorers={scorers} leagueSlug={league.slug} />
        </section>
      )}
    </>
  );
}
