import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { MatchGrid } from "@/components/MatchGrid";
import { SectionHeader } from "@/components/SectionHeader";
import { ApiError, api } from "@/lib/api";
import { formatGoalDifference } from "@/lib/format";
import { SeasonPicker } from "@/components/SeasonPicker";
import { readParam, type SearchParams } from "@/lib/leagues";
import type { League, Standing, TeamDetail } from "@/lib/types";
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
  for (const league of leagues) {
    const standings = await api.getStandings(league.slug, season);
    const standing = standings.find((row) => row.team.id === team.id);
    if (standing) return { league, standing };
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
  const upcoming = matches.filter(
    (m) => m.home_score === null && m.status !== "cancelled",
  );

  return (
    <div className={pageStyles.page}>
      <header className={styles.header}>
        <Crest team={team} size="lg" />
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
                {placement.league.name}
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
              Έδρα{team.home_field.city ? ` · ${team.home_field.city}` : ""}
            </span>
          </span>
        </Link>
      )}

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

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
