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
 *    <p><a href="https://…/vathmologia?liga=a-katigoria">…</a></p>
 *
 *  No header and no tab bar (SiteHeader and BottomNav step aside under
 *  /embed), and one link back, so the reader can find the rest. The snippet
 *  carries a second link outside the iframe: a link inside one belongs to
 *  our page, not the host's, and search engines credit it to nobody. The
 *  one in the host's own HTML is the one that counts. */
export default async function EmbedStandings({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { league } = await resolveLeague(await searchParams);
  if (!league) return <Empty title="Καμία διοργάνωση" />;

  const standings = await api.getStandings(league.slug);
  const src = `${SITE}/embed/vathmologia?liga=${league.slug}`;
  const label = leagueLabel(league);
  const snippet = [
    `<iframe src="${src}" width="100%" height="620" style="border:0" title="Βαθμολογία ${label}"></iframe>`,
    `<p style="font-size:13px;margin:4px 0 0"><a href="${SITE}/vathmologia?liga=${league.slug}">Βαθμολογία ${label} ΕΠΣ Ηπείρου · Πάμε Σέντρα</a></p>`,
  ].join("\n");

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Βαθμολογία {label}</h1>
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
        <code>{snippet}</code>
      </details>
    </div>
  );
}
