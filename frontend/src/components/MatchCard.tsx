import Link from "next/link";

import { Crest } from "./Crest";
import {
  formatDayDate,
  formatShortKickoff,
  formatTime,
  formatWeekday,
  listName,
  matchStatusLabel,
} from "@/lib/format";
import type { Match } from "@/lib/types";
import styles from "./MatchCard.module.css";

const isPlayed = (m: Match) =>
  m.home_score !== null && m.away_score !== null;

/** The chip in the card header. Its wording carries the date for anything that
 *  is not currently running, because that is the first thing a reader checks. */
function StatusChip({ match }: { match: Match }) {
  const label = matchStatusLabel(match.status, match.kickoff_at);

  if (match.status === "live" || match.status === "halftime") {
    return (
      <span className={`${styles.chip} ${styles.chipLive}`}>
        <span className={styles.pulse} />
        {match.status === "live" && match.minute
          ? `LIVE · ${match.minute}′`
          : label}
      </span>
    );
  }

  const tone =
    match.status === "postponed" || match.status === "cancelled"
      ? styles.chipWarn
      : match.status === "finished" || match.status === "awarded"
        ? styles.chipDone
        : styles.chipNext;

  const date = formatDayDate(match.kickoff_at);
  return (
    <span className={`${styles.chip} ${tone}`}>
      {date ? `${label} · ${date}` : label}
    </span>
  );
}

function TeamRow({
  team,
  score,
  dim,
}: {
  team: Match["home_team"];
  score: number | null;
  dim: boolean;
}) {
  return (
    <div className={`${styles.teamRow} ${dim ? styles.dim : ""}`}>
      <Crest team={team} size="md" />
      <Link href={`/somateia/${team.slug}`} className={styles.teamName}>
        {listName(team)}
      </Link>
      <span className={styles.score}>{score ?? "–"}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: Match }) {
  const played = isPlayed(match);
  const home = match.home_score;
  const away = match.away_score;
  // A drawn or unplayed match dims neither side; only the loser recedes.
  const homeDim = played && home! < away!;
  const awayDim = played && away! < home!;

  const venue = match.field?.short_name ?? match.field?.name;
  const footer = [venue, match.referee ? `Διαιτ. ${match.referee}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`${styles.card} ${match.is_live ? styles.cardLive : ""}`}
    >
      <header className={styles.header}>
        <StatusChip match={match} />
        {match.matchday !== null && (
          <span className={styles.matchday}>Αγων. {match.matchday}</span>
        )}
      </header>

      {match.status === "postponed" || match.status === "cancelled" ? (
        <div className={styles.postponed}>
          <span className={styles.postponedTeams}>
            {listName(match.home_team)} — {listName(match.away_team)}
          </span>
          <span className={styles.postponedNote}>
            {match.note ?? "Νέα ημερομηνία σύντομα"}
          </span>
        </div>
      ) : played ? (
        <div className={styles.teams}>
          <TeamRow team={match.home_team} score={home} dim={homeDim} />
          <TeamRow team={match.away_team} score={away} dim={awayDim} />
        </div>
      ) : (
        <div className={styles.fixture}>
          <div className={styles.fixtureTeams}>
            <div className={styles.fixtureTeam}>
              <Crest team={match.home_team} size="sm" />
              <Link
                href={`/somateia/${match.home_team.slug}`}
                className={styles.teamName}
              >
                {listName(match.home_team)}
              </Link>
            </div>
            <div className={styles.fixtureTeam}>
              <Crest team={match.away_team} size="sm" />
              <Link
                href={`/somateia/${match.away_team.slug}`}
                className={styles.teamName}
              >
                {listName(match.away_team)}
              </Link>
            </div>
          </div>
          <div className={styles.kickoff}>
            <span className={styles.kickoffTime}>
              {formatTime(match.kickoff_at)}
            </span>
            <span className={styles.kickoffDay}>
              {formatWeekday(match.kickoff_at)}
            </span>
          </div>
        </div>
      )}

      {/* A link in the footer rather than the whole card: the team names are
          already links, and an anchor cannot contain another one. */}
      <footer className={styles.footer}>
        {footer && <span className={styles.footerText}>{footer}</span>}
        <Link href={`/agones/${match.id}`} className={styles.detail}>
          Λεπτομέρειες
        </Link>
      </footer>
    </article>
  );
}

/** One line per fixture — the compact form used in "Επόμενη αγωνιστική". */
export function FixtureRow({ match }: { match: Match }) {
  const shortName = listName;
  return (
    <li className={styles.fixtureRow}>
      <span className={styles.fixtureRowTeams}>
        {shortName(match.home_team)} — {shortName(match.away_team)}
      </span>
      <span className={styles.fixtureRowTime}>
        {formatShortKickoff(match.kickoff_at)}
      </span>
    </li>
  );
}
