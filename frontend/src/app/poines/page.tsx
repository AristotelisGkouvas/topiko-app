import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

import { LastUpdated } from "@/components/LastUpdated";
import { SeasonPicker } from "@/components/SeasonPicker";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { formatDayDate, plural } from "@/lib/format";
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

  // One club's bans. With 177 clubs in the list, "who is out on Sunday" is
  // unanswerable by scrolling — a president wants his own, a coach the
  // opponent's.
  const club = readParam(params, "somateio");
  const clubs = [
    ...new Map(
      suspensions.filter((b) => b.team).map((b) => [b.team!.slug, b.team!]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "el"));
  const shown = club ? suspensions.filter((b) => b.team?.slug === club) : suspensions;
  const clubName = clubs.find((c) => c.slug === club)?.name;

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Ποινές" />

      <LastUpdated
        timestamp={meta.last_scraped_at}
        sourceUrl={meta.source_url}
      />

      <div className={pageStyles.pickers}>
        <SeasonPicker seasons={seasons} active={season} />
        {clubs.length > 1 && (
          // A plain GET form: works before any script has loaded.
          <form method="get" action="/poines" className={styles.filter}>
            {season && <input type="hidden" name="periodos" value={season} />}
            <label className="srOnly" htmlFor="somateio">
              Σωματείο
            </label>
            <select id="somateio" name="somateio" defaultValue={club ?? ""} className={styles.select}>
              <option value="">Όλα τα σωματεία</option>
              {clubs.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className={styles.go}>
              Εμφάνιση
            </button>
          </form>
        )}
      </div>

      {club && clubName && (
        <p className={styles.filtering}>
          {shown.length} {plural(shown.length, "ποινή", "ποινές")} για {clubName} ·{" "}
          <Link href={season ? `/poines?periodos=${season}` : "/poines"}>όλες</Link>
        </p>
      )}

      {shown.length > 0 ? (
        <ul className={styles.list}>
          {shown.map((ban) => (
            <li key={ban.id} className={styles.row}>
              <span className={styles.matches}>
                {ban.matches}
                <span className={styles.matchesLabel}>
                  {plural(ban.matches, "αγώνας", "αγώνες")}
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
              : // The picker hides itself with a single season, so only point
                // at it when it is actually there.
                `Η ένωση δεν έχει δημοσιεύσει ποινές για την τρέχουσα περίοδο.${
                  seasons.length > 1 ? " Διάλεξε προηγούμενη περίοδο από πάνω." : ""
                }`
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
