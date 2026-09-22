import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, api } from "@/lib/api";
import { formatDayDate } from "@/lib/format";
import type { HeadToHead, Match } from "@/lib/types";
import pageStyles from "../../../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Params = Promise<{ home: string; away: string }>;

async function load(home: string, away: string): Promise<HeadToHead> {
  try {
    return await api.getHeadToHead(home, away);
  } catch (error) {
    if (error instanceof ApiError && [400, 404].includes(error.status)) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { home, away } = await params;
  try {
    const record = await load(home, away);
    return {
      title: `${record.home.name} — ${record.away.name}`,
      description: `${record.played} συναντήσεις: ${record.home_wins}-${record.draws}-${record.away_wins}`,
    };
  } catch {
    return { title: "Κόντρα" };
  }
}

export default async function HeadToHeadPage({ params }: { params: Params }) {
  const { home, away } = await params;
  const record = await load(home, away);

  if (record.played === 0) {
    return (
      <div className={pageStyles.page}>
        <h1>
          {record.home.name} — {record.away.name}
        </h1>
        <p className={styles.note}>
          Δεν υπάρχει καταγεγραμμένη συνάντηση ανάμεσα στα δύο σωματεία.
        </p>
      </div>
    );
  }

  // Shares of the bar. Guarded against a zero total even though the branch
  // above already rules it out — a NaN width silently collapses the bar.
  const share = (n: number) =>
    record.played > 0 ? `${(n / record.played) * 100}%` : "0%";

  return (
    <div className={pageStyles.page}>
      <header className={styles.hero}>
        <div className={styles.sides}>
          <ClubSide slug={record.home.slug} team={record.home} />
          <div className={styles.versus}>
            <span className={styles.played}>{record.played}</span>
            <span className={styles.playedLabel}>συναντήσεις</span>
          </div>
          <ClubSide slug={record.away.slug} team={record.away} />
        </div>

        <div
          className={styles.bar}
          role="img"
          aria-label={`${record.home_wins} νίκες ${record.home.name}, ${record.draws} ισοπαλίες, ${record.away_wins} νίκες ${record.away.name}`}
        >
          <span className={styles.barHome} style={{ width: share(record.home_wins) }} />
          <span className={styles.barDraw} style={{ width: share(record.draws) }} />
          <span className={styles.barAway} style={{ width: share(record.away_wins) }} />
        </div>

        <div className={styles.tally}>
          <span>{record.home_wins} νίκες</span>
          <span>{record.draws} ισοπαλίες</span>
          <span>{record.away_wins} νίκες</span>
        </div>

        <p className={styles.goals}>
          Γκολ {record.home_goals}–{record.away_goals}
          {record.first_meeting && (
            <> · πρώτη συνάντηση {formatDayDate(record.first_meeting)}</>
          )}
        </p>
      </header>

      <section>
        <SectionHeader title="Οι τελευταίες συναντήσεις" />
        <ul className={styles.list}>
          {record.matches.map((match) => (
            <MeetingRow
              key={match.id}
              match={match}
              homeTeamId={record.home.id}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ClubSide({
  team,
  slug,
}: {
  team: HeadToHead["home"];
  slug: string;
}) {
  return (
    <Link href={`/somateia/${slug}`} className={styles.side}>
      <Crest team={team} size="lg" />
      <span className={styles.sideName}>{team.name}</span>
    </Link>
  );
}

/** One meeting, written from the page's point of view.
 *
 *  The clubs swap ground between seasons, so the stored 3-1 belongs to whoever
 *  was at home that day. Re-pointing it here is what lets the column be read
 *  straight down as "us, them".
 */
function MeetingRow({
  match,
  homeTeamId,
}: {
  match: Match;
  homeTeamId: number;
}) {
  const sameWayRound = match.home_team.id === homeTeamId;
  const ours = sameWayRound ? match.home_score : match.away_score;
  const theirs = sameWayRound ? match.away_score : match.home_score;
  const outcome =
    ours === theirs ? "draw" : (ours ?? 0) > (theirs ?? 0) ? "win" : "loss";

  return (
    <li className={styles.row}>
      <span className={styles.date}>{formatDayDate(match.kickoff_at)}</span>
      <span className={styles.venue}>{sameWayRound ? "εντός" : "εκτός"}</span>
      <span className={`${styles.score} ${styles[outcome]}`}>
        {ours}–{theirs}
      </span>
      <Link href={`/agones/${match.id}`} className={styles.link}>
        λεπτομέρειες
      </Link>
    </li>
  );
}
