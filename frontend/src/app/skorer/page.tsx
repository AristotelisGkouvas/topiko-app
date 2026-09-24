import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

import { Crest } from "@/components/Crest";
import { LastUpdated } from "@/components/LastUpdated";
import { LeagueTabs } from "@/components/LeagueTabs";
import { SeasonPicker } from "@/components/SeasonPicker";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { leagueLabel, resolveLeague, type SearchParams } from "@/lib/leagues";
import type { Scorer } from "@/lib/types";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Σκόρερ" };

export default async function ScorersPage({
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
      <div className={pageStyles.page}>
        <h1>Σκόρερ</h1>
        <Empty title="Καμία διοργάνωση ακόμη" />
      </div>
    );
  }

  const scorers = await api.listScorers(league.slug, { season });

  const ranked = withSharedPositions(scorers);

  return (
    <div className={pageStyles.page}>
      <PageHeader title={`Σκόρερ ${leagueLabel(league)}`} />

      <LastUpdated
        timestamp={meta.last_scraped_at}
        sourceUrl={meta.source_url}
      />

      <div className={pageStyles.pickers}>
        <SeasonPicker seasons={seasons} active={season} />
        <LeagueTabs leagues={leagues} active={league.slug} />
      </div>

      {scorers.length > 0 ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.caption}>
                Πρώτοι σκόρερ {leagueLabel(league)}, όπως τους δημοσιεύει η
                ένωση.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.rank}>
                    #
                  </th>
                  <th scope="col">Παίκτης</th>
                  <th scope="col" className={styles.num}>
                    <abbr title="Γκολ">Γ</abbr>
                  </th>
                  <th scope="col" className={`${styles.num} ${styles.optional}`}>
                    <abbr title="Κίτρινες κάρτες">ΚΙΤ</abbr>
                  </th>
                  <th scope="col" className={`${styles.num} ${styles.optional}`}>
                    <abbr title="Κόκκινες κάρτες">ΚΟΚ</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ row, position }) => (
                    <tr key={row.player.id}>
                      <td className={styles.rank}>{position}</td>
                      <td>
                        <div className={styles.player}>
                          {row.team && <Crest team={row.team} size="sm" />}
                          <div className={styles.names}>
                            <Link
                              href={`/paiktes/${row.player.slug}`}
                              className={styles.playerName}
                            >
                              {row.player.name}
                            </Link>
                            {row.team && (
                              <Link
                                href={`/somateia/${row.team.slug}`}
                                className={styles.teamName}
                              >
                                {row.team.name}
                              </Link>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`${styles.num} ${styles.goals}`}>
                        {row.goals ?? "—"}
                      </td>
                      <td className={`${styles.num} ${styles.optional}`}>
                        {row.yellow_cards ?? "—"}
                      </td>
                      <td className={`${styles.num} ${styles.optional}`}>
                        {row.red_cards ?? "—"}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            Η ένωση δημοσιεύει την κορυφή της λίστας. Μια παύλα σημαίνει ότι η
            στήλη δεν δημοσιεύτηκε για αυτή τη διοργάνωση — όχι μηδέν.
          </p>
        </>
      ) : (
        <Empty
          title="Χωρίς σκόρερ"
          body="Η λίστα εμφανίζεται μόλις η ένωση δημοσιεύσει τα πρώτα γκολ της περιόδου."
        />
      )}
    </div>
  );
}

/** Rank rows so equal goal counts share a position.
 *
 *  A reader counts "third top scorer", not "third row", so four players on
 *  four goals are all first and the next one is fifth. Done as a pass over the
 *  list rather than inside the render loop: a counter mutated while mapping is
 *  a variable whose value depends on how many times React chose to render.
 */
function withSharedPositions(
  rows: Scorer[],
): { row: Scorer; position: number }[] {
  let position = 0;
  let previousGoals: number | null | undefined = undefined;

  return rows.map((row, index) => {
    if (row.goals !== previousGoals) {
      position = index + 1;
      previousGoals = row.goals;
    }
    return { row, position };
  });
}
