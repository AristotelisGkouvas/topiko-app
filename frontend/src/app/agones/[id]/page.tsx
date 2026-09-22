import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, api } from "@/lib/api";
import {
  formatDayDate,
  formatTime,
  matchStatusLabel,
} from "@/lib/format";
import { leagueLabel } from "@/lib/leagues";
import type { Match, MatchDetail, Standing } from "@/lib/types";
import pageStyles from "../../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function load(id: string): Promise<MatchDetail> {
  const numeric = Number.parseInt(id, 10);
  // Checked before the request: /agones/κάτι would otherwise reach the API as
  // NaN and come back as a 422 that renders like a broken page.
  if (!Number.isInteger(numeric) || numeric < 1) notFound();

  try {
    return await api.getMatch(numeric);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const { match } = await load(id);
    return {
      title: `${match.home_team.name} - ${match.away_team.name}`,
    };
  } catch {
    return { title: "Αγώνας" };
  }
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { match, league, head_to_head, home_standing, away_standing } =
    await load(id);

  const played = match.home_score !== null && match.away_score !== null;
  const live = match.status === "live" || match.status === "halftime";

  return (
    <div className={pageStyles.page}>
      <nav className={styles.breadcrumb} aria-label="Διαδρομή">
        <Link href={`/vathmologia?liga=${league.slug}`}>
          {leagueLabel(league)}
        </Link>
        {match.matchday && <span> · {match.matchday}η αγωνιστική</span>}
      </nav>

      <section className={styles.scoreboard}>
        <TeamSide team={match.home_team} standing={home_standing} />

        <div className={styles.middle}>
          {played ? (
            <p className={`${styles.score} ${live ? styles.scoreLive : ""}`}>
              {match.home_score}
              <span className={styles.dash}>–</span>
              {match.away_score}
            </p>
          ) : (
            <p className={styles.kickoff}>{formatTime(match.kickoff_at)}</p>
          )}

          <p className={styles.state}>
            {live && match.minute
              ? `LIVE · ${match.minute}′`
              : matchStatusLabel(match.status, match.kickoff_at)}
          </p>

          {match.home_score_ht !== null && match.away_score_ht !== null && (
            <p className={styles.halftime}>
              ημίχρονο {match.home_score_ht}–{match.away_score_ht}
            </p>
          )}
        </div>

        <TeamSide team={match.away_team} standing={away_standing} />
      </section>

      <dl className={styles.facts}>
        <Fact label="Ημερομηνία" value={formatDayDate(match.kickoff_at)} />
        <Fact label="Ώρα" value={formatTime(match.kickoff_at)} />
        <Fact
          label="Γήπεδο"
          value={
            match.field ? (
              <Link href={`/gipeda?anazitisi=${encodeURIComponent(match.field.name)}`}>
                {match.field.name}
              </Link>
            ) : null
          }
        />
        <Fact label="Διαιτητής" value={match.referee} />
      </dl>

      {match.note && <p className={styles.note}>{match.note}</p>}

      {/* Where the number came from. A score an editor typed during the match
          is a different claim from one lifted off the federation's own page,
          and this is the one screen with room to say so. */}
      {played && match.data_source !== "scraper" && (
        <p className={styles.provenance}>
          {match.data_source === "manual_live"
            ? "Καταχωρήθηκε από συντάκτη κατά τη διάρκεια του αγώνα· εκκρεμεί η επιβεβαίωση από την ένωση."
            : "Καταχωρήθηκε από συντάκτη και επιβεβαιώθηκε."}
        </p>
      )}

      {head_to_head.length > 0 && (
        <section className={styles.history}>
          <SectionHeader title="Προηγούμενες συναντήσεις" />
          <p className={styles.allMeetings}>
            <Link
              href={`/kontra/${match.home_team.slug}/${match.away_team.slug}`}
            >
              Όλο το ιστορικό των δύο σωματείων →
            </Link>
          </p>
          <ul className={styles.historyList}>
            {head_to_head.map((previous) => (
              <HistoryRow
                key={previous.id}
                match={previous}
                homeTeamId={match.home_team.id}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TeamSide({
  team,
  standing,
}: {
  team: Match["home_team"];
  standing: Standing | null;
}) {
  return (
    <div className={styles.side}>
      <Crest team={team} size="lg" />
      <Link href={`/somateia/${team.slug}`} className={styles.sideName}>
        {team.name}
      </Link>
      {standing && (
        <span className={styles.position}>
          {standing.position}η θέση · {standing.points}β
        </span>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

/** One earlier meeting.
 *
 *  `homeTeamId` is the home side of the fixture being viewed, not of this row:
 *  the two clubs swap ground between seasons, so the result is rewritten from
 *  the current page's point of view rather than shown as it was recorded.
 */
function HistoryRow({
  match,
  homeTeamId,
}: {
  match: Match;
  homeTeamId: number;
}) {
  const sameWayRound = match.home_team.id === homeTeamId;
  const left = sameWayRound ? match.home_score : match.away_score;
  const right = sameWayRound ? match.away_score : match.home_score;

  const outcome =
    left === right ? "draw" : (left ?? 0) > (right ?? 0) ? "win" : "loss";

  return (
    <li className={styles.historyRow}>
      <span className={styles.historyDate}>
        {formatDayDate(match.kickoff_at)}
      </span>
      <span className={styles.historyVenue}>
        {sameWayRound ? "εντός" : "εκτός"}
      </span>
      <span className={`${styles.historyScore} ${styles[outcome]}`}>
        {left}–{right}
      </span>
      <Link href={`/agones/${match.id}`} className={styles.historyLink}>
        λεπτομέρειες
      </Link>
    </li>
  );
}
