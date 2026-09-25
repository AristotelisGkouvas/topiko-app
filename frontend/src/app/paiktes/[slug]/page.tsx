import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, api } from "@/lib/api";
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
      description: player.total_goals
        ? `${player.total_goals} γκολ σε ${player.seasons_scored} περιόδους${club ? ` · ${club}` : ""}`
        : club,
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
          <Total value={player.total_goals} label="γκολ" />
          <Total value={player.seasons_scored} label="περίοδοι με γκολ" />
          <Total value={player.clubs.length} label="σωματεία" />
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

      <section>
        <SectionHeader title="Ανά περίοδο" />
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
          Τα γκολ προκύπτουν από τις λίστες σκόρερ που δημοσιεύει η ένωση, όχι
          από τα φύλλα αγώνα — οπότε είναι <strong>κατώτατο όριο</strong>. Μια
          περίοδος χωρίς δημοσιευμένη λίστα εμφανίζεται με παύλα· δεν σημαίνει
          ότι ο παίκτης δεν αγωνίστηκε.
        </p>
      </section>
    </div>
  );
}

function Total({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.total}>
      <dt className={styles.totalValue}>{value}</dt>
      <dd className={styles.totalLabel}>{label}</dd>
    </div>
  );
}
