import type { Metadata } from "next";

import { LeagueChips } from "@/components/LeagueChips";
import { LiveStandings } from "@/components/LiveStandings";
import { MatchRow } from "@/components/MatchRow";
import { PageHeader } from "@/components/PageHeader";
import { ScorerRail } from "@/components/ScorerRail";
import { SectionHeader } from "@/components/SectionHeader";
import { SeasonPicker } from "@/components/SeasonPicker";
import { StandingsTable } from "@/components/StandingsTable";
import { VenueTable } from "@/components/VenueTable";
import Link from "next/link";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { matchdayLabel } from "@/lib/format";
import { leagueLabel, readParam, resolveLeague, type SearchParams } from "@/lib/leagues";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/** The division in the title and in the card. Next's file-based
 *  opengraph-image never sees ?liga=, so a Β΄ Κατηγορία link shared to Viber
 *  unfurled with the Α΄ table; the card is a route that does, named here. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const { league, season } = await resolveLeague(params);
  if (!league) return { title: "Βαθμολογία" };
  const query = new URLSearchParams({ liga: league.slug });
  if (season) query.set("periodos", season);
  const label = leagueLabel(league);
  const image = { url: `/vathmologia/karta?${query}`, width: 1200, height: 630, alt: `Βαθμολογία · ${label}` };
  return {
    title: `Βαθμολογία · ${label}`,
    description: `Η βαθμολογία της ${label} της ΕΠΣ Ηπείρου, με φόρμα και ζώνες ανόδου/υποβιβασμού.`,
    alternates: { canonical: `/vathmologia?${query}` },
    openGraph: { images: [image] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

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
        <PageHeader column="wide" title="Βαθμολογία" />
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
        column="wide"
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
              season={season}
            />
            {/* An old season is a different page, and it says so up here.
                The current one needs no picker in front of the table: most
                visits are "this season", and three rows of controls pushed
                the table to the middle of a phone. */}
            {season && (
              <SeasonPicker
                seasons={seasons}
                active={season}
                league={leagueLabel(league)}
              />
            )}
          </div>

          {/* Live projection is a current-season thing; asked for an old
              league the API answers 404, logged on every visit. */}
          {!season && <LiveStandings leagueSlug={league.slug} />}

          {/* One control in three parts, not three pills: it is one choice. */}
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
              <div className={styles.tools}>
                {/* A picture for the group chat — read by all, where a link
                    is opened by few. */}
                <a
                  href={`/vathmologia/eikona?liga=${league.slug}&lipsi=1`}
                  download
                  data-track="table_image"
                  data-track-props={JSON.stringify({ league: league.slug })}
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

          {!season && seasons.length > 1 && (
            <div className={styles.history}>
              <SeasonPicker
                seasons={seasons}
                active={season}
                league={leagueLabel(league)}
              />
            </div>
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
