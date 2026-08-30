import { LastUpdated } from "@/components/LastUpdated";
import { LeagueTabs } from "@/components/LeagueTabs";
import { LiveMatches } from "@/components/LiveMatches";
import { FixtureRow } from "@/components/MatchCard";
import { SectionHeader } from "@/components/SectionHeader";
import { StandingsTable } from "@/components/StandingsTable";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayLabel } from "@/lib/format";
import { resolveLeague, type SearchParams } from "@/lib/leagues";
import styles from "./page.module.css";

/** Live scores mean the home page can never be statically cached. */
export const dynamic = "force-dynamic";

const STANDINGS_PREVIEW = 5;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const [{ leagues, league }, meta, association] = await Promise.all([
    // The home screen is about today — live scores and the next αγωνιστική —
    // so it stays on the current season even if ?periodos= is in the URL.
    // Honouring it here would show a 2016 table beside a live strip.
    resolveLeague({ ...params, periodos: undefined }),
    api.getMeta(),
    api.getAssociation(),
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

  const nextMatchday = (league.current_matchday ?? 0) + 1;
  const [live, standings, upcoming] = await Promise.all([
    api.listLiveMatches(),
    api.getStandings(league.slug),
    api.listMatches(league.slug, { matchday: nextMatchday }),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>{association.short_name ?? association.name}</h1>
        <LastUpdated
          timestamp={meta.last_scraped_at}
          sourceUrl={meta.source_url}
        />
      </div>

      <LeagueTabs leagues={leagues} active={league.slug} />

      <LiveMatches initial={live} />

      <section className={styles.section} aria-labelledby="standings-heading">
        <SectionHeader
          id="standings-heading"
          title="Βαθμολογία"
          action={{ href: `/vathmologia?liga=${league.slug}`, label: "Πλήρης" }}
        />
        {standings.length > 0 ? (
          <StandingsTable
            standings={standings.slice(0, STANDINGS_PREVIEW)}
            league={league}
            compact
          />
        ) : (
          <Empty
            title="Χωρίς βαθμολογία"
            body="Η βαθμολογία εμφανίζεται μόλις παιχτεί η πρώτη αγωνιστική."
          />
        )}
      </section>

      <section className={styles.section} aria-labelledby="upcoming-heading">
        <SectionHeader
          id="upcoming-heading"
          title="Επόμενη αγωνιστική"
          action={{
            href: `/programma?liga=${league.slug}&agonistiki=${nextMatchday}`,
            label: "Πρόγραμμα",
          }}
        />
        {upcoming.length > 0 ? (
          <div className={styles.card}>
            <ul className={styles.fixtureList}>
              {upcoming.map((match) => (
                <FixtureRow key={match.id} match={match} />
              ))}
            </ul>
          </div>
        ) : (
          <Empty
            title="Καμία αναμέτρηση"
            body={`Το πρόγραμμα της ${matchdayLabel(nextMatchday)} δεν έχει ανακοινωθεί ακόμη.`}
            action={{
              href: `/apotelesmata?liga=${league.slug}`,
              label: "Δες τα αποτελέσματα",
            }}
          />
        )}
      </section>
    </div>
  );
}
