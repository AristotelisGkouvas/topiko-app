import { HomeTeasers } from "@/components/HomeTeasers";
import { Intro } from "@/components/Intro";
import { LastUpdated } from "@/components/LastUpdated";
import { LiveMatches } from "@/components/LiveMatches";
import { MyClub } from "@/components/MyClub";
import { FixtureRow } from "@/components/MatchCard";
import { SectionHeader } from "@/components/SectionHeader";
import { LeagueRail } from "@/components/LeagueRail";
import { MiniStandings } from "@/components/MiniStandings";
import { WelcomeCard } from "@/components/WelcomeCard";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayGenitive } from "@/lib/format";
import { resolveLeague, type SearchParams } from "@/lib/leagues";
import type { League, Standing } from "@/lib/types";
import styles from "./page.module.css";

/** Live scores mean the home page can never be statically cached. */
export const dynamic = "force-dynamic";

export default async function HomePage({
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
  const shownMatchday = seasonOver ? played : played + 1;

  const [live, standings, fixtures] = await Promise.all([
    api.listLiveMatches(),
    api.getStandings(league.slug),
    api.listMatches(league.slug, { matchday: shownMatchday }),
  ]);

  // "Results" over a list with no scores in it is a promise the list does not
  // keep; until the first final whistle the round is still a programme.
  const anyScored = fixtures.some(
    (m) => m.home_score !== null && m.away_score !== null,
  );
  const listTitle = anyScored ? "ΑΠΟΤΕΛΕΣΜΑΤΑ" : "ΠΡΟΓΡΑΜΜΑ";

  return (
    <div className={`${styles.page} ${styles.home}`}>
      <Intro />
      <h1 className="srOnly">Πάμε Σέντρα · {league.name}</h1>
      {/* Screen D01's three columns: division rail, the page, the numbers.
          One column on a phone, where the rail's job belongs to the header
          chip and the right-hand numbers come after the results. */}
      <LeagueRail
        leagues={leagues}
        active={league.slug}
        matchday={league.current_matchday}
        totalMatchdays={league.total_matchdays}
      />

      <div className={styles.main}>
        {/* First: "Σαν σήμερα" (and an open MVP vote) is what changes every
            day, so it is what a Tuesday visitor should see before anything. */}
        <HomeTeasers />

        <WelcomeCard />

        {/* The design opens on the reader's own club. Everything below is the
            league; this is the one block that is about them. */}
        <MyClub />

        {/* Only when something is actually being played — an empty strip
            labelled "ΤΩΡΑ ΖΩΝΤΑΝΑ" reads as a broken feature. */}
        <LiveMatches initial={live} />

        <section className={styles.section} aria-labelledby="results-heading">
          <SectionHeader
            id="results-heading"
            title={`${listTitle} · ${shownMatchday}η`}
            action={{
              href: `/agones?liga=${league.slug}&agonistiki=${shownMatchday}`,
              label: "Όλα ›",
            }}
          />
          {fixtures.length > 0 ? (
            <div className={styles.card}>
              <ul className={styles.fixtureList}>
                {fixtures.map((match) => (
                  <FixtureRow key={match.id} match={match} />
                ))}
              </ul>
            </div>
          ) : (
            <Empty
              title="Καμία αναμέτρηση"
              body={`Το πρόγραμμα της ${matchdayGenitive(shownMatchday)} δεν έχει ανακοινωθεί ακόμη.`}
              action={{
                href: `/agones?liga=${league.slug}`,
                label: "Δες τους αγώνες",
              }}
            />
          )}
        </section>
      </div>

      {/* Rendered once. On a phone the grid is one column, so this simply
          follows the results; on a wide screen it becomes the right-hand
          column beside them. */}
      <aside className={styles.side} aria-label="Βαθμολογία και σκόρερ">
        <Numbers standings={standings} league={league} />
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

/** The table preview and the scorers. */
function Numbers({
  standings,
  league,
}: {
  standings: Standing[];
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
    </>
  );
}
