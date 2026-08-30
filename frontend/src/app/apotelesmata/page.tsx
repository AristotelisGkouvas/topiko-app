import type { Metadata } from "next";

import { LastUpdated } from "@/components/LastUpdated";
import { LeagueTabs } from "@/components/LeagueTabs";
import { MatchGrid } from "@/components/MatchGrid";
import { MatchdayPicker } from "@/components/MatchdayPicker";
import { SeasonPicker } from "@/components/SeasonPicker";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayLabel } from "@/lib/format";
import { resolveLeague, resolveMatchday, type SearchParams } from "@/lib/leagues";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Αποτελέσματα" };

export default async function ResultsPage({
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
        <h1>Αποτελέσματα</h1>
        <Empty title="Καμία διοργάνωση ακόμη" />
      </div>
    );
  }

  const matchday = resolveMatchday(params, league);
  const matches = await api.listMatches(league.slug, { matchday, season });

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>Αποτελέσματα {league.name}</h1>
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
          body: `Δεν υπάρχουν αγώνες καταχωρημένοι για την ${matchdayLabel(matchday)}.`,
        }}
      />
    </div>
  );
}
