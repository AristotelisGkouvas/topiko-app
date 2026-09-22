import type { Metadata } from "next";
import Link from "next/link";

import { LastUpdated } from "@/components/LastUpdated";
import { SeasonPicker } from "@/components/SeasonPicker";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { formatDayDate } from "@/lib/format";
import { readParam, type SearchParams } from "@/lib/leagues";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ποινές",
  description: "Ποιοι παίκτες δεν αγωνίζονται και για πόσους αγώνες.",
};

export default async function SuspensionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const season = readParam(params, "periodos");

  const [seasons, suspensions, meta] = await Promise.all([
    api.listSeasons(),
    api.listSuspensions({ season }),
    api.getMeta(),
  ]);

  const current = seasons.find((s) => s.is_current);

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Ποινές</h1>
        <LastUpdated
          timestamp={meta.last_scraped_at}
          sourceUrl={meta.source_url}
        />
      </div>

      <div className={pageStyles.pickers}>
        <SeasonPicker seasons={seasons} active={season} />
      </div>

      {suspensions.length > 0 ? (
        <ul className={styles.list}>
          {suspensions.map((ban) => (
            <li key={ban.id} className={styles.row}>
              <span className={styles.matches}>
                {ban.matches}
                <span className={styles.matchesLabel}>
                  {ban.matches === 1 ? "αγώνας" : "αγώνες"}
                </span>
              </span>

              <span className={styles.who}>
                <Link
                  href={`/paiktes/${ban.player.slug}`}
                  className={styles.player}
                >
                  {ban.player.name}
                </Link>
                <span className={styles.detail}>
                  {ban.team ? (
                    <Link
                      href={`/somateia/${ban.team.slug}`}
                      className={styles.team}
                    >
                      {ban.team.name}
                    </Link>
                  ) : (
                    <span className={styles.unknownTeam}>
                      {ban.fixture ?? "άγνωστο σωματείο"}
                    </span>
                  )}
                  <span className={styles.league}> · {ban.league_name}</span>
                </span>
              </span>

              <span className={styles.when}>
                {ban.decided_on ? formatDayDate(ban.decided_on) : "—"}
                {ban.matchday ? (
                  <span className={styles.matchday}>
                    {ban.matchday}η αγων.
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title="Καμία ποινή"
          body={
            season && season !== current?.slug
              ? "Δεν υπάρχει καταγεγραμμένη ποινή για αυτή την περίοδο."
              : "Η ένωση δεν έχει δημοσιεύσει ποινές για την τρέχουσα περίοδο. Διάλεξε προηγούμενη περίοδο από πάνω."
          }
        />
      )}

      <p className={styles.note}>
        Όπως τις δημοσιεύει η πειθαρχική επιτροπή της ένωσης. Όπου λείπει
        σωματείο, ο παίκτης δεν εμφανίζεται σε καμία δημοσιευμένη λίστα και η
        πηγή τυπώνει μόνο το ζεύγος του αγώνα.
      </p>
    </div>
  );
}
