import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { HeadToHeadBar, tally } from "@/components/HeadToHeadBar";
import { ShareButton } from "@/components/ShareButton";
import { MatchTicker } from "@/components/MatchTicker";
import { Prediction } from "@/components/Prediction";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, api } from "@/lib/api";
import {
  formatDayDate,
  formatTime,
  matchStatusLabel,
} from "@/lib/format";
import { leagueLabel } from "@/lib/leagues";
import type { Match, MatchDetail, Standing } from "@/lib/types";
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

  const directions = match.field
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [match.field.name, match.field.city].filter(Boolean).join(", "),
      )}`
    : null;
  const record = tally(head_to_head, match.home_team.id);

  return (
    <div className={styles.page}>
      {/* The navy band runs the full width and carries the crumb, the crests
          and the score. Screens 03 and D03 spend the page's whole block of
          brand colour here — it is the one thing the reader came for. */}
      <div className={styles.hero}>
        <nav className={styles.breadcrumb} aria-label="Διαδρομή">
          <Link href={`/agones?liga=${league.slug}`}>‹ Αγώνες</Link>
          <span>
            {leagueLabel(league)}
            {match.matchday ? ` · ${match.matchday}η αγωνιστική` : ""}
            {match.kickoff_at ? ` · ${formatDayDate(match.kickoff_at)}` : ""}
          </span>
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
      </div>

      <div className={styles.body}>
        <div className={styles.info}>
          <SectionHeader title="ΠΛΗΡΟΦΟΡΙΕΣ" />
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
            {/* Only when one has been appointed. A row reading "Διαιτητής —"
                on every fixture is a column of nothing. */}
            <Fact label="Διαιτητής" value={match.referee} />
          </dl>

          <div className={styles.actions}>
            {directions && (
              <a
                className={styles.primary}
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
              >
                Οδηγίες προς το γήπεδο
              </a>
            )}
            <ShareButton
              title={`${match.home_team.name} – ${match.away_team.name}`}
              className={styles.secondary}
            />
          </div>

          {match.note && <p className={styles.note}>{match.note}</p>}

          {/* Where the number came from. A score an editor typed during the
              match is a different claim from one lifted off the federation's
              own page, and this is the one screen with room to say so. */}
          {played && match.data_source !== "scraper" && (
            <p className={styles.provenance}>
              {match.data_source === "manual_live"
                ? "Καταχωρήθηκε από συντάκτη κατά τη διάρκεια του αγώνα· εκκρεμεί η επιβεβαίωση από την ένωση."
                : "Καταχωρήθηκε από συντάκτη και επιβεβαιώθηκε."}
            </p>
          )}
        </div>

        <div className={styles.centre}>
          <MatchTicker matchId={match.id} />

          <Prediction
            matchId={match.id}
            homeName={match.home_team.short_name ?? match.home_team.name}
            awayName={match.away_team.short_name ?? match.away_team.name}
          />

          {head_to_head.length > 0 && (
            <section className={styles.history}>
              <SectionHeader
                title="ΠΡΟΗΓΟΥΜΕΝΕΣ ΣΥΝΑΝΤΗΣΕΙΣ"
                action={{
                  href: `/kontra/${match.home_team.slug}/${match.away_team.slug}`,
                  label: "Κόντρα ›",
                }}
              />
              <div className={styles.historyCard}>
                <div className={styles.barWrap}>
                  <HeadToHeadBar
                    home={match.home_team}
                    away={match.away_team}
                    record={record}
                  />
                </div>
                <ul className={styles.historyList}>
                  {head_to_head.map((previous) => (
                    <HistoryRow
                      key={previous.id}
                      match={previous}
                      homeTeamId={match.home_team.id}
                    />
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>

        {(home_standing || away_standing) && (
          <aside className={styles.standings} aria-label="Θέσεις στη βαθμολογία">
            <SectionHeader
              title="ΣΤΗ ΒΑΘΜΟΛΟΓΙΑ"
              action={{
                href: `/vathmologia?liga=${league.slug}`,
                label: "Πλήρης ›",
              }}
            />
            <div className={styles.standingsCard}>
              {[
                { team: match.home_team, standing: home_standing },
                { team: match.away_team, standing: away_standing },
              ]
                .filter((row) => row.standing !== null)
                .map(({ team, standing }) => (
                  <Link
                    key={team.slug}
                    href={`/somateia/${team.slug}`}
                    className={styles.standingRow}
                  >
                    <span className={styles.standingPos}>
                      {standing!.position}
                    </span>
                    <Crest team={team} size="sm" />
                    <span className={styles.standingName}>
                      {team.short_name ?? team.name}
                    </span>
                    <span className={styles.standingPoints}>
                      {standing!.points}
                    </span>
                  </Link>
                ))}
            </div>
          </aside>
        )}
      </div>
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
