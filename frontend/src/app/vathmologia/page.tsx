import type { Metadata } from "next";

import { LeagueChips } from "@/components/LeagueChips";
import { LiveStandings } from "@/components/LiveStandings";
import { MatchRow } from "@/components/MatchRow";
import { PageHeader } from "@/components/PageHeader";
import { ScorerRail } from "@/components/ScorerRail";
import { SectionHeader } from "@/components/SectionHeader";
import { SeasonPicker } from "@/components/SeasonPicker";
import { CopyText } from "@/components/CopyText";
import { StandingsTable } from "@/components/StandingsTable";
import { VenueTable } from "@/components/VenueTable";
import Link from "next/link";
import { tableText } from "@/lib/shareText";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayLabel } from "@/lib/format";
import { leagueLabel, readParam, resolveLeague, type SearchParams } from "@/lib/leagues";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Βαθμολογία",
  description: "Η βαθμολογία κάθε κατηγορίας της ΕΠΣ Ηπείρου.",
};

/** Screens 04 and D04.
 *
 *  On a wide screen the table keeps the left and a rail on the right carries
 *  the scorers and the round's fixtures — the two things a reader looks at
 *  immediately after a table, and which otherwise cost a navigation each.
 */
export default async function StandingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const { seasons, season, leagues, league } = await resolveLeague(params);

  if (!league) {
    return (
      <>
        <PageHeader title="Βαθμολογία" />
        <Empty
          title="Καμία διοργάνωση"
          body="Δεν έχει δημοσιευτεί πρωτάθλημα για αυτή την περίοδο."
        />
      </>
    );
  }

  const round = league.current_matchday;
  // "Εντός" / "Εκτός": the same season counted from one venue only.
  const asked = readParam(params, "pinakas");
  const venue = asked === "entos" ? "home" : asked === "ektos" ? "away" : null;
  const venueMatches = venue
    ? await api.listMatches(league.slug, { season }).catch(() => [])
    : [];
  const tab = (key: string | null, label: string) => {
    const q = new URLSearchParams({ liga: league.slug });
    if (season) q.set("periodos", season);
    if (key) q.set("pinakas", key);
    const on = (key ?? null) === (asked === "entos" || asked === "ektos" ? asked : null);
    return (
      <Link
        key={label}
        href={`/vathmologia?${q}`}
        className={`${styles.venueTab} ${on ? styles.venueTabOn : ""}`}
        aria-current={on ? "page" : undefined}
      >
        {label}
      </Link>
    );
  };
  const [standings, scorers, fixtures] = await Promise.all([
    api.getStandings(league.slug, season),
    api.listScorers(league.slug, { season, limit: 6 }).catch(() => []),
    round
      ? api.listMatches(league.slug, { matchday: round, season }).catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Βαθμολογία"
        aside={round ? `μετά την ${matchdayLabel(round)}` : undefined}
      />

      <div className={styles.page}>
        <div className={styles.main}>
          <div className={styles.controls}>
            <LeagueChips
              leagues={leagues}
              active={league.slug}
              basePath="/vathmologia"
            />
            <SeasonPicker seasons={seasons} active={season} />
          </div>

          <LiveStandings leagueSlug={league.slug} />

          <nav className={styles.venueTabs} aria-label="Είδος βαθμολογίας">
            {tab(null, "Γενική")}
            {tab("entos", "Εντός έδρας")}
            {tab("ektos", "Εκτός έδρας")}
          </nav>

          {venue ? (
            <VenueTable matches={venueMatches} side={venue} />
          ) : standings.length > 0 ? (
            <>
              <StandingsTable standings={standings} league={league} />
              <div>
                <CopyText
                  text={tableText(`Βαθμολογία ${leagueLabel(league)}`, standings)}
                />{" "}
                {/* A picture for the group chat — read by all, where a link
                    is opened by few. */}
                <a
                  href={`/vathmologia/eikona?liga=${league.slug}&lipsi=1`}
                  download
                  className={styles.imageLink}
                >
                  Λήψη εικόνας
                </a>
              </div>
            </>
          ) : (
            <Empty
              title="Χωρίς βαθμολογία"
              body="Η βαθμολογία εμφανίζεται μόλις παιχτεί η πρώτη αγωνιστική."
            />
          )}
        </div>

        {/* Rendered once: under the table on a phone, beside it above
            1040px. */}
        <aside className={styles.side} aria-label={`Σκόρερ ${leagueLabel(league)}`}>
          <Rail
            scorers={scorers}
            fixtures={fixtures}
            leagueSlug={league.slug}
            round={round}
          />
        </aside>
      </div>
    </>
  );
}

/** The scorers and the round's fixtures. */
function Rail({
  scorers,
  fixtures,
  leagueSlug,
  round,
}: {
  scorers: Awaited<ReturnType<typeof api.listScorers>>;
  fixtures: Awaited<ReturnType<typeof api.listMatches>>;
  leagueSlug: string;
  round: number | null;
}) {
  return (
    <>
      {scorers.length > 0 && (
        <section className={styles.block}>
          <SectionHeader title="ΣΚΟΡΕΡ" />
          <ScorerRail scorers={scorers} leagueSlug={leagueSlug} />
        </section>
      )}

      {fixtures.length > 0 && round !== null && (
        <section className={styles.block}>
          <SectionHeader
            title={`${round}η ΑΓΩΝΙΣΤΙΚΗ`}
            action={{
              href: `/agones?liga=${leagueSlug}&agonistiki=${round}`,
              label: "Όλοι ›",
            }}
          />
          <div className={styles.card}>
            {fixtures.slice(0, 5).map((match, i, shown) => (
              <MatchRow
                key={match.id}
                match={match}
                last={i === shown.length - 1}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
