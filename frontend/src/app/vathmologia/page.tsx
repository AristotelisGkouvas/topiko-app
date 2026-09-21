import type { Metadata } from "next";

import { LastUpdated } from "@/components/LastUpdated";
import { LeagueTabs } from "@/components/LeagueTabs";
import { SeasonPicker } from "@/components/SeasonPicker";
import { StandingsTable } from "@/components/StandingsTable";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayLabel } from "@/lib/format";
import { leagueLabel, resolveLeague, type SearchParams } from "@/lib/leagues";
import styles from "../page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Βαθμολογίες" };

export default async function StandingsPage({
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
        <h1>Βαθμολογίες</h1>
        <Empty title="Καμία διοργάνωση ακόμη" />
      </div>
    );
  }

  const standings = await api.getStandings(league.slug, season);
  const played = league.current_matchday
    ? `μετά την ${matchdayLabel(league.current_matchday)}`
    : undefined;

  return (
    <div className={styles.page}>
      <div className={styles.titleBlock}>
        <h1>Βαθμολογία {leagueLabel(league)}</h1>
        <LastUpdated
          timestamp={meta.last_scraped_at}
          suffix={played}
          sourceUrl={meta.source_url}
        />
      </div>

      <div className={styles.pickers}>
        <SeasonPicker seasons={seasons} active={season} />
        <LeagueTabs leagues={leagues} active={league.slug} />
      </div>

      {standings.length > 0 ? (
        <StandingsTable standings={standings} league={league} />
      ) : (
        <Empty
          title="Χωρίς βαθμολογία"
          body="Η βαθμολογία εμφανίζεται μόλις παιχτεί η πρώτη αγωνιστική."
        />
      )}
    </div>
  );
}
