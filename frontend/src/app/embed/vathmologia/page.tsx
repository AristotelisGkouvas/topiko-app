import type { Metadata } from "next";

import { StandingsTable } from "@/components/StandingsTable";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { leagueLabel, resolveLeague, type SearchParams } from "@/lib/leagues";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Βαθμολογία · ενσωμάτωση",
  robots: { index: false, follow: true },
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";

/** The table alone, for a club's or a paper's own site in an iframe:
 *
 *    <iframe src="https://…/embed/vathmologia?liga=a-katigoria"
 *            width="100%" height="620" style="border:0"></iframe>
 *
 *  No header and no tab bar (SiteHeader and BottomNav step aside under
 *  /embed), and one link back, so the reader can find the rest. */
export default async function EmbedStandings({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { league } = await resolveLeague(await searchParams);
  if (!league) return <Empty title="Καμία διοργάνωση" />;

  const standings = await api.getStandings(league.slug);
  const src = `${SITE}/embed/vathmologia?liga=${league.slug}`;

  return (
    <div className={styles.wrap}>
      <p className={styles.title}>Βαθμολογία {leagueLabel(league)}</p>
      {standings.length > 0 ? (
        <StandingsTable standings={standings} league={league} />
      ) : (
        <Empty title="Χωρίς βαθμολογία" />
      )}
      <p className={styles.credit}>
        <a href={`${SITE}/vathmologia?liga=${league.slug}`} target="_blank" rel="noreferrer">
          Πάμε Σέντρα · πλήρης βαθμολογία και αγώνες ›
        </a>
      </p>
      <details className={styles.code}>
        <summary>Κώδικας ενσωμάτωσης</summary>
        <code>{`<iframe src="${src}" width="100%" height="620" style="border:0" title="Βαθμολογία ${leagueLabel(league)}"></iframe>`}</code>
      </details>
    </div>
  );
}
