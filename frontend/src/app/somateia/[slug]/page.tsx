import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { FollowButton } from "@/components/FollowButton";
import { MatchGrid } from "@/components/MatchGrid";
import { SectionHeader } from "@/components/SectionHeader";
import { CalendarLink } from "@/components/CalendarLink";
import { ApiError, api } from "@/lib/api";
import { formatGoalDifference } from "@/lib/format";
import { SeasonPicker } from "@/components/SeasonPicker";
import { leagueLabel, readParam, type SearchParams } from "@/lib/leagues";
import type { FieldRef, League, Match, Standing, TeamDetail } from "@/lib/types";
import pageStyles from "../../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function loadTeam(slug: string): Promise<TeamDetail> {
  try {
    return await api.getTeam(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

/** Which league the club plays in, and where it stands.
 *
 *  There is no per-team standings endpoint, so this scans the association's
 *  leagues — of which an ΕΠΣ publishes a handful, not hundreds. If that ever
 *  stops being true it becomes one endpoint on the backend, not a cache here.
 */
async function findStanding(
  team: TeamDetail,
  season: string | undefined,
): Promise<{ league: League; standing: Standing } | null> {
  const leagues = await api.listLeagues(season);
  // In parallel: a season here publishes seventeen competitions, and asking
  // for them one after another made a club page wait seventeen round trips to
  // answer a question that is the same for all of them.
  const tables = await Promise.all(
    leagues.map((league) => api.getStandings(league.slug, season)),
  );
  for (const [i, standings] of tables.entries()) {
    const standing = standings.find((row) => row.team.id === team.id);
    if (standing) return { league: leagues[i], standing };
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const team = await api.getTeam(slug);
    return { title: team.name };
  } catch {
    return { title: "Σωματείο" };
  }
}

function FormPills({ form }: { form: string }) {
  return (
    <span className={styles.form}>
      {form.split("").map((result, i) => (
        <span
          key={i}
          className={`${styles.pill} ${
            result === "Ν"
              ? styles.win
              : result === "Ι"
                ? styles.draw
                : styles.loss
          }`}
        >
          {result}
        </span>
      ))}
    </span>
  );
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const team = await loadTeam(slug);
  const query = readParam(await searchParams, "periodos");

  // A club that folded in 2019 has no current season, so opening on "now"
  // shows an empty page for half the register. Fall back to the last season it
  // actually played instead.
  const season = team.seasons.includes(query ?? "")
    ? query
    : team.seasons[0];

  const [placement, matches] = await Promise.all([
    findStanding(team, season),
    api.getTeamMatches(slug, season),
  ]);

  const standing = placement?.standing;
  const played = matches.filter(
    (m) => m.home_score !== null && m.away_score !== null,
  );
  // "No score" is not the same as "still to come": whole youth divisions are
  // never scored, so on an archived season every fixture the club ever played
  // qualified and "Επόμενοι αγώνες" filled up with matches from 2016.
  const upcoming = stillToCome(matches);

  return (
    <div className={pageStyles.page}>
      <header className={styles.header}>
        <Crest team={team} size="lg" />
        {/* The ☆ from the kit's team profile header. */}
        <FollowButton slug={team.slug} name={team.name} />
        <div className={styles.identity}>
          <h1 className={styles.name}>{team.name}</h1>
          <p className={styles.meta}>
            {[
              team.founded_year ? `Ιδρ. ${team.founded_year}` : null,
              team.city,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {placement && (
            <p className={styles.chips}>
              <span className={styles.chip}>
                {placement.standing.position}η θέση
              </span>
              <Link
                href={`/vathmologia?liga=${placement.league.slug}`}
                className={styles.chipLink}
              >
                {leagueLabel(placement.league)}
              </Link>
            </p>
          )}
        </div>
      </header>

      {standing && (
        <div className={styles.stats}>
          <Stat value={standing.points} label="Βαθμοί" />
          <Stat
            value={`${standing.won}-${standing.drawn}-${standing.lost}`}
            label="Ν-Ι-Η"
          />
          <Stat
            value={`${standing.goals_for}:${standing.goals_against}`}
            label="Γκολ"
          />
          <Stat
            value={formatGoalDifference(standing.goal_difference)}
            label="Διαφορά"
          />
        </div>
      )}

      {standing?.form && (
        <div className={styles.formRow}>
          <span className={styles.formLabel}>Φόρμα</span>
          <FormPills form={standing.form} />
        </div>
      )}

      {team.home_field && (
        <Link
          href={`/gipeda`}
          className={styles.venue}
          aria-label={`Έδρα: ${team.home_field.name}`}
        >
          <span className={styles.venueGlyph} aria-hidden="true">
            ⌖
          </span>
          <span>
            <span className={styles.venueName}>{team.home_field.name}</span>
            <span className={styles.venueMeta}>
              {venueLine(team.home_field)}
            </span>
          </span>
        </Link>
      )}

      <CalendarLink slug={team.slug} name={team.name} />

      {team.seasons.length > 1 && (
        <SeasonPicker
          seasons={team.seasons.map((slug) => ({
            slug,
            name: slug,
            // The club's own seasons, so "current" here means the latest it
            // played rather than the one the federation is running.
            is_current: slug === team.seasons[0],
          }))}
          active={season}
          markerLabel="τελευταία"
        />
      )}

      <section aria-labelledby="upcoming">
        <SectionHeader id="upcoming" title="Επόμενοι αγώνες" />
        <MatchGrid
          matches={upcoming.slice(0, 4)}
          empty={{ title: "Κανένας προγραμματισμένος αγώνας" }}
        />
      </section>

      <section aria-labelledby="results">
        <SectionHeader id="results" title="Τελευταία αποτελέσματα" />
        <MatchGrid
          matches={played.slice(-6).reverse()}
          empty={{
            title: "Κανένα αποτέλεσμα",
            body: season
              ? `Δεν υπάρχουν καταχωρημένα αποτελέσματα για την περίοδο ${season}.`
              : undefined,
          }}
        />
      </section>
    </div>
  );
}

/** Fixtures a reader would call upcoming.
 *
 *  Reading the clock is why this is a plain function rather than inline in the
 *  component: a component body has to be pure, and this page is force-dynamic
 *  precisely so the answer is recomputed per request.
 */
function stillToCome(matches: Match[]): Match[] {
  const now = Date.now();
  return matches.filter(
    (m) =>
      m.home_score === null &&
      m.status !== "cancelled" &&
      (m.kickoff_at === null || new Date(m.kickoff_at).getTime() >= now),
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

/** "Έδρα · χλοοτάπητας · 800 θέσεις", dropping whatever the register left
 *  blank. Surface is filled in for every ground; capacity for three of them. */
function venueLine(field: FieldRef): string {
  const SURFACES: Record<string, string> = {
    grass: "χλοοτάπητας",
    artificial: "συνθετικός",
    dirt: "χωμάτινο",
  };
  return [
    "Έδρα",
    field.surface ? SURFACES[field.surface] : null,
    field.capacity ? `${field.capacity} θέσεις` : null,
    field.city,
  ]
    .filter(Boolean)
    .join(" · ");
}
