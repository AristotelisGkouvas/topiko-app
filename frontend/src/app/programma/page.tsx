import type { Metadata } from "next";

import { LastUpdated } from "@/components/LastUpdated";
import { LeagueTabs } from "@/components/LeagueTabs";
import { MatchGrid } from "@/components/MatchGrid";
import { MatchdayPicker } from "@/components/MatchdayPicker";
import { SeasonPicker } from "@/components/SeasonPicker";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayGenitive } from "@/lib/format";
import {
  leagueLabel,
  resolveLeague,
  resolveMatchday,
  type SearchParams,
} from "@/lib/leagues";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Πρόγραμμα" };

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const [{ seasons, season, leagues, league }, meta] = await Promise.all([
    resolveLeague(params),
    api.getMeta(),
  ]);

  if (!league) {
    return (
      <div className={styles.page}>
        <h1>Πρόγραμμα</h1>
        <Empty title="Καμία διοργάνωση ακόμη" />
      </div>
    );
  }

  // Unlike the results page, this one opens on what is *next*, not on what was
  // just played.
  const matchday = resolveMatchday(params, league, "next");

  const matches = await api.listMatches(league.slug, { matchday, season });

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>Πρόγραμμα {leagueLabel(league)}</h1>
        <LastUpdated
          timestamp={meta.last_scraped_at}
          sourceUrl={meta.source_url}
        />
      </div>

      <div className={styles.pickers}>
        <SeasonPicker seasons={seasons} active={season} />
        <LeagueTabs leagues={leagues} active={league.slug} />
      </div>

      <MatchdayPicker current={matchday} total={league.total_matchdays} />

      <MatchGrid
        matches={matches}
        empty={{
          title: "Καμία αναμέτρηση",
          body: `Το πρόγραμμα της ${matchdayGenitive(matchday)} δεν έχει ανακοινωθεί ακόμη.`,
          action: {
            href: `/apotelesmata?liga=${league.slug}`,
            label: "Δες τα αποτελέσματα",
          },
        }}
      />
    </div>
  );
}
