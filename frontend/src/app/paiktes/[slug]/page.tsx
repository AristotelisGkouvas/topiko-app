import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, api } from "@/lib/api";
import { formatDayDate, plural } from "@/lib/format";
import type { PlayerDetail } from "@/lib/types";
import pageStyles from "../../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<PlayerDetail> {
  try {
    return await api.getPlayer(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const player = await load(slug);
    const club = player.clubs[0]?.name;
    return {
      title: player.name,
      description: player.appearances_total
        ? `${player.appearances_total} ${plural(player.appearances_total, "συμμετοχή", "συμμετοχές")}${
            sheetGoals(player) ? `, ${sheetGoals(player)} γκολ` : ""
          }${club ? ` · ${club}` : ""}`
        : player.total_goals
          ? `${player.total_goals} γκολ σε ${player.seasons_scored} ${plural(player.seasons_scored, "περίοδο", "περιόδους")}${club ? ` · ${club}` : ""}`
          : club,
      alternates: { canonical: `/paiktes/${slug}` },
      // Fifteen thousand names with no goal against them are the thin pages
      // the sitemap already leaves out; this keeps them out of the index too.
      // Indexed once there is something to read: a goal on a published list,
      // or a match on a report. The rest are names and nothing else.
      ...(!player.total_goals && !player.live_goals && !player.appearances_total && {
        robots: { index: false, follow: true },
      }),
    };
  } catch {
    return { title: "Παίκτης" };
  }
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const player = await load(slug);

  const scored = player.seasons.filter((s) => s.goals);
  const best = scored.reduce(
    (top, line) => ((line.goals ?? 0) > (top?.goals ?? 0) ? line : top),
    scored[0],
  );

  return (
    <div className={pageStyles.page}>
      <header className={styles.hero}>
        <h1 className={styles.name}>{player.name}</h1>
        <p className={styles.sub}>
          {player.clubs[0]?.name ?? "Χωρίς καταγεγραμμένο σωματείο"}
          {player.birth_year ? ` · γεν. ${player.birth_year}` : ""}
        </p>

        <dl className={styles.totals}>
          {player.appearances_total > 0 && (
            <>
              <Total
                value={player.appearances_total}
                label={plural(player.appearances_total, "συμμετοχή", "συμμετοχές")}
              />
              <Total value={minutesTotal(player)} label="λεπτά" />
            </>
          )}
          <Total value={Math.max(player.total_goals, sheetGoals(player))} label="γκολ" />
          <Total
            value={player.seasons_scored}
            label={plural(player.seasons_scored, "περίοδος με γκολ", "περίοδοι με γκολ")}
          />
          <Total
            value={player.clubs.length}
            label={plural(player.clubs.length, "σωματείο", "σωματεία")}
          />
          {best?.goals ? (
            <Total value={best.goals} label={`καλύτερη (${best.season.slug})`} />
          ) : null}
          {/* Counted apart: the federation's lists are the record, these are
              what volunteers logged at the ground with this name. */}
          {player.live_goals > 0 && (
            <Total value={player.live_goals} label="γκολ από τα γήπεδα (ανεπίσημα)" />
          )}
        </dl>
      </header>

      {player.clubs.length > 0 && (
        <ul className={styles.clubs}>
          {player.clubs.map((club) => (
            <li key={club.id}>
              <Link href={`/somateia/${club.slug}`} className={styles.club}>
                <Crest team={club} size="sm" />
                {club.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {player.sheet_seasons.length > 0 && (
        <section>
          <SectionHeader title="Συμμετοχές" />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Περίοδος</th>
                  <th scope="col">Σωματείο</th>
                  <th scope="col" className={styles.num}><abbr title="Συμμετοχές">Σ</abbr></th>
                  <th scope="col" className={styles.num}><abbr title="Βασικός">Β</abbr></th>
                  <th scope="col" className={styles.num}><abbr title="Λεπτά">Λ</abbr></th>
                  <th scope="col" className={styles.num}><abbr title="Γκολ">Γ</abbr></th>
                  <th scope="col" className={styles.num}><abbr title="Κίτρινες">Κ</abbr></th>
                  <th scope="col" className={styles.num}><abbr title="Αποβολές">Α</abbr></th>
                </tr>
              </thead>
              <tbody>
                {player.sheet_seasons.map((line, index) => (
                  <tr key={`${line.season.slug}-${line.league_slug}-${index}`}>
                    <td className={styles.season}>
                      {line.season.slug}
                      <span className={styles.leagueSmall}>{line.league_name}</span>
                    </td>
                    <td className={styles.teamCell}>
                      {line.team ? (
                        <Link href={`/somateia/${line.team.slug}`} className={styles.teamLink}>
                          {line.team.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={styles.num}>{line.apps}</td>
                    <td className={styles.num}>{line.starts}</td>
                    <td className={styles.num}>{line.minutes}</td>
                    <td className={`${styles.num} ${styles.goals}`}>{line.goals}</td>
                    <td className={styles.num}>{line.yellow}</td>
                    <td className={styles.num}>{line.red}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {player.appearances.length > 0 && (
        <section>
          <SectionHeader title="Αγώνες" />
          <ul className={styles.games}>
            {player.appearances.slice(0, 30).map((a) => (
              <li key={a.match_id}>
                <Link href={`/agones/${a.match_id}`} className={styles.game}>
                  <span className={styles.gameDate}>
                    {a.kickoff_at ? formatDayDate(a.kickoff_at) : a.season.slug}
                  </span>
                  <span className={styles.gameVs}>
                    {a.home ? "εντός" : "εκτός"} με {a.opponent?.name ?? "—"}
                  </span>
                  <span className={styles.gameScore}>
                    {a.goals_for ?? "–"}–{a.goals_against ?? "–"}
                  </span>
                  <span className={styles.gameMe}>
                    {a.minutes}′{a.goals ? ` · ${a.goals} γκολ` : ""}
                    {a.red ? " · αποβολή" : a.yellow ? " · κίτρινη" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {player.appearances_total > 30 && (
            <p className={styles.note}>
              Οι 30 πιο πρόσφατοι από {player.appearances_total} αγώνες.
            </p>
          )}
        </section>
      )}

      <section>
        <SectionHeader title="Γκολ ανά περίοδο (λίστες σκόρερ)" />
        {player.seasons.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Περίοδος</th>
                  <th scope="col">Διοργάνωση</th>
                  <th scope="col">Σωματείο</th>
                  <th scope="col" className={styles.num}>
                    <abbr title="Γκολ">Γ</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {player.seasons.map((line, index) => (
                  <tr key={`${line.season.slug}-${line.league_slug}-${index}`}>
                    <td className={styles.season}>{line.season.slug}</td>
                    <td>
                      <Link
                        href={`/skorer?liga=${line.league_slug}&periodos=${line.season.slug}`}
                        className={styles.leagueLink}
                      >
                        {line.league_name}
                      </Link>
                    </td>
                    <td className={styles.teamCell}>
                      {line.team ? (
                        <Link
                          href={`/somateia/${line.team.slug}`}
                          className={styles.teamLink}
                        >
                          {line.team.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${styles.num} ${styles.goals}`}>
                      {line.goals ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.note}>
            Δεν υπάρχει καταγεγραμμένη γραμμή για αυτόν τον παίκτη.
          </p>
        )}

        <p className={styles.note}>
          Αυτός ο πίνακας βγαίνει από τις λίστες σκόρερ της ένωσης, που έχουν
          μόνο τους πρώτους κάθε λίστας, οπότε είναι <strong>κατώτατο όριο</strong>.
          Οι «Συμμετοχές» και οι «Αγώνες» βγαίνουν από τα φύλλα αγώνα, που το site
          διαβάζει έναν έναν: όσο γεμίζει το αρχείο, μεγαλώνουν.
        </p>
      </section>
    </div>
  );
}

/** Goals counted from the match reports the site has read. */
function sheetGoals(player: PlayerDetail): number {
  return player.sheet_seasons.reduce((sum, line) => sum + line.goals, 0);
}

function minutesTotal(player: PlayerDetail): number {
  return player.sheet_seasons.reduce((sum, line) => sum + line.minutes, 0);
}

function Total({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.total}>
      <dt className={styles.totalValue}>{value}</dt>
      <dd className={styles.totalLabel}>{label}</dd>
    </div>
  );
}
