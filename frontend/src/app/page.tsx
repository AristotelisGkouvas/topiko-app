import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Crest } from "@/components/Crest";
import { HomeTeasers } from "@/components/HomeTeasers";
import { InstallCard } from "@/components/InstallCard";
import { Intro } from "@/components/Intro";
import { LastUpdated } from "@/components/LastUpdated";
import { LiveMatches } from "@/components/LiveMatches";
import { MyClub } from "@/components/MyClub";
import { SponsorSeen } from "@/components/SponsorSeen";
import { Empty } from "@/components/States";
import { api, sponsorHref } from "@/lib/api";
import { formatGoalDifference, formatTime, matchdayGenitive, upper } from "@/lib/format";
import { leagueLabel, resolveLeague, resolveMatchday, type SearchParams } from "@/lib/leagues";
import { mediaUrl } from "@/lib/media";
import type { League, Match, Scorer, Standing } from "@/lib/types";
import { JsonLd, SITE } from "@/lib/seo";
import { HomeSkeleton } from "./HomeSkeleton";
import styles from "./page.module.css";

/** What a search for "βαθμολογία ΕΠΣ Ηπείρου" should find: the words people
 *  type, not the tagline. ?liga= variants of the home page fold into "/". */
export const metadata: Metadata = {
  title: { absolute: "Πάμε Σέντρα · Αποτελέσματα και βαθμολογίες ΕΠΣ Ηπείρου" },
  description:
    "Αποτελέσματα, βαθμολογίες, πρόγραμμα και σκόρερ σε όλες τις κατηγορίες της ΕΠΣ Ηπείρου, live την ώρα του αγώνα. Κάθε ομάδα, κάθε γήπεδο.",
  alternates: { canonical: "/" },
};

/** Lets Google put a search box under the result, straight into /anazitisi. */
const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Πάμε Σέντρα",
  url: `${SITE}/`,
  inLanguage: "el",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${SITE}/anazitisi?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

/** Live scores mean the home page can never be statically cached. */
export const dynamic = "force-dynamic";

/** The page streams: the skeleton goes out at once, the data follows. It is
 *  the most visited page and waits on several API calls, and with nothing to
 *  show in between, a tap on "Αρχική" over 3G looked like a tap that had not
 *  registered. A Suspense boundary rather than a loading.tsx, which here at
 *  the root would also stand in for every page that has none of its own. */
export default function HomePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [{ leagues, league }, meta] = await Promise.all([
    // The home screen is about today — live scores and the next αγωνιστική —
    // so it stays on the current season even if ?periodos= is in the URL.
    resolveLeague({ ...params, periodos: undefined }),
    api.getMeta(),
  ]);

  if (!league) {
    return (
      <div className={styles.page}>
        <h1>Πάμε Σέντρα</h1>
        <Empty
          title="Καμία διοργάνωση ακόμη"
          body="Δεν έχει δημοσιευτεί πρωτάθλημα για την τρέχουσα περίοδο."
        />
      </div>
    );
  }

  const played = league.current_matchday ?? 0;
  const total = league.total_matchdays;
  // Between seasons there is no next αγωνιστική: fall back to the last one.
  const seasonOver = total !== null && played >= total;
  const nextMatchday = seasonOver ? played : played + 1;
  const picked = params.agonistiki ? resolveMatchday(params, league) : null;

  const [live, standings, scorers, presenters, lastList, nextList] = await Promise.all([
    api.listLiveMatches(),
    api.getStandings(league.slug),
    api.listScorers(league.slug, { limit: 5 }),
    api.listPlatformSponsors("home").catch(() => []),
    played > 0 ? api.listMatches(league.slug, { matchday: picked ?? played }) : Promise.resolve([]),
    picked ? Promise.resolve([]) : api.listMatches(league.slug, { matchday: nextMatchday }),
  ]);

  // One round on show. Picked with ‹ ›, that one; otherwise the round just
  // played while its results are still the news (two days), then the next.
  const round = picked
    ? { n: picked, matches: lastList }
    : played > 0 && (seasonOver || recent(lastList))
      ? { n: played, matches: lastList }
      : { n: nextMatchday, matches: nextList };

  // The invitation offers the division's clubs by name, so a reader finds
  // their village alphabetically rather than by where it sits in the table.
  const clubs = standings.map((row) => row.team).sort((a, b) => a.name.localeCompare(b.name, "el"));

  const presenter = presenters.length ? presenters[today() % presenters.length] : null;
  const presenterHref = presenter?.website_url ? await sponsorHref("platform", presenter.id) : null;

  return (
    <div className={`${styles.page} ${styles.home}`}>
      <JsonLd data={WEBSITE_LD} />
      <Intro />
      <h1 className="srOnly">Πάμε Σέντρα · {league.name}</h1>

      {/* The divisions as tabs across the top: one band, every division a
          tap away, the one on show underlined. */}
      <nav className={styles.cats} aria-label="Κατηγορία">
        <div className={styles.catsInner}>
          {leagues.map((l) => (
            <Link
              key={l.slug}
              href={`/?liga=${l.slug}`}
              className={styles.cat}
              aria-current={l.slug === league.slug ? "page" : undefined}
            >
              {leagueLabel(l)}
            </Link>
          ))}
        </div>
      </nav>

      <div className={styles.columns}>
        <div className={styles.colRound}>
          <MyClub clubs={clubs} leagueName={league.name} />

          {/* Only when something is actually being played. */}
          <LiveMatches initial={live} />

          <RoundCard
            league={league}
            matchday={round.n}
            matches={round.matches}
            presenter={
              presenter && {
                id: presenter.id,
                name: presenter.name,
                logo: mediaUrl(presenter.logo_url),
                href: presenterHref,
              }
            }
          />
        </div>

        <div className={styles.colTable}>
          <Table standings={standings} league={league} />
        </div>

        <div className={styles.colSide}>
          <HomeTeasers />
          <Scorers scorers={scorers} league={league} />
          <InstallCard />
          <LastUpdated timestamp={meta.last_scraped_at} sourceUrl={meta.source_url} />
        </div>

        {/* Under all three columns, on one line where it fits. */}
        <p className={styles.volunteer}>
          Είσαι από σωματείο; Δώσε το σκορ <Link href="/ethelontis">live από το γήπεδο</Link> με
          τον κωδικό που σου έδωσε η ένωση.
        </p>
      </div>
    </div>
  );
}

/** Days since 1970 on the Greek calendar, for a sponsor that changes daily
 *  and stays the same all day. */
function today(): number {
  const athens = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(Date.now());
  return Math.floor(Date.parse(athens) / 86_400_000);
}

/** A round whose last match kicked off within two days: still the news. */
function recent(matches: Match[]): boolean {
  const last = Math.max(0, ...matches.map((m) => (m.kickoff_at ? Date.parse(m.kickoff_at) : 0)));
  return last > 0 && Date.now() - last < 2 * 86_400_000;
}

const dayFmt = new Intl.DateTimeFormat("el-GR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Athens",
});
const dayMonthFmt = new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long", timeZone: "Europe/Athens" });
const dayOnlyFmt = new Intl.DateTimeFormat("el-GR", { day: "numeric", timeZone: "Europe/Athens" });
const monthShortFmt = new Intl.DateTimeFormat("el-GR", { month: "short", timeZone: "Europe/Athens" });

/** "3-4 Οκτωβρίου", "26-27 Σεπτ.", "31 Οκτ.-1 Νοε.". */
function span(matches: Match[], long: boolean): string | null {
  const days = matches.map((m) => m.kickoff_at).filter((d): d is string => !!d).map((d) => new Date(d));
  if (days.length === 0) return null;
  const first = new Date(Math.min(...days.map((d) => d.getTime())));
  const last = new Date(Math.max(...days.map((d) => d.getTime())));
  const same = (a: Date, b: Date, f: Intl.DateTimeFormat) => f.format(a) === f.format(b);
  const month = (d: Date) => (long ? dayMonthFmt.format(d).replace(/^\d+\s/, "") : monthShortFmt.format(d));
  if (same(first, last, dayMonthFmt)) return long ? dayMonthFmt.format(first) : `${dayOnlyFmt.format(first)} ${month(first)}`;
  if (same(first, last, monthShortFmt)) return `${dayOnlyFmt.format(first)}-${dayOnlyFmt.format(last)} ${month(last)}`;
  return `${dayOnlyFmt.format(first)} ${monthShortFmt.format(first)}-${dayOnlyFmt.format(last)} ${monthShortFmt.format(last)}`;
}

/** The round card: navy head with ‹ round ›, the sponsor presenting it, then
 *  the matches grouped by day. */
function RoundCard({
  league,
  matchday,
  matches,
  presenter,
}: {
  league: League;
  matchday: number;
  matches: Match[];
  presenter: { id: number; name: string; logo: string | null; href: string | null } | null;
}) {
  const scored = matches.some((m) => m.home_score !== null && m.away_score !== null);
  const when = span(matches, !scored);
  const total = league.total_matchdays;

  // By day, in kickoff order; undated last.
  const groups = new Map<string, Match[]>();
  for (const m of [...matches].sort((a, b) => (a.kickoff_at ?? "~").localeCompare(b.kickoff_at ?? "~"))) {
    const key = m.kickoff_at ? upper(dayFmt.format(new Date(m.kickoff_at)).replace(",", "")) : "ΧΩΡΙΣ ΗΜΕΡΟΜΗΝΙΑ";
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }

  const plate = presenter && (
    <>
      <span className={styles.presentLead}>ΜΕ ΤΗΝ ΥΠΟΣΤΗΡΙΞΗ</span>
      {presenter.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
        <img src={presenter.logo} alt={presenter.name} className={styles.presentLogo} />
      ) : (
        <span className={styles.presentWord}>{presenter.name}</span>
      )}
    </>
  );

  return (
    <section className={styles.round} aria-labelledby="round-title">
      <div className={styles.roundHead}>
        <div className={styles.roundNav}>
          {matchday > 1 ? (
            <Link
              href={`/?liga=${league.slug}&agonistiki=${matchday - 1}`}
              className={styles.step}
              aria-label={`${matchday - 1}η αγωνιστική`}
              scroll={false}
            >
              ‹
            </Link>
          ) : (
            <span className={`${styles.step} ${styles.stepOff}`} aria-hidden="true">
              ‹
            </span>
          )}
          <span className={styles.roundTitles}>
            <h2 id="round-title" className={styles.roundTitle}>
              {matchday}η αγωνιστική
            </h2>
            <span className={styles.roundSub}>
              {[scored ? "Αποτελέσματα" : "Πρόγραμμα", when].filter(Boolean).join(" · ")}
            </span>
          </span>
          {total === null || matchday < total ? (
            <Link
              href={`/?liga=${league.slug}&agonistiki=${matchday + 1}`}
              className={styles.step}
              aria-label={`${matchday + 1}η αγωνιστική`}
              scroll={false}
            >
              ›
            </Link>
          ) : (
            <span className={`${styles.step} ${styles.stepOff}`} aria-hidden="true">
              ›
            </span>
          )}
        </div>
        {presenter && (
          <SponsorSeen platform={[presenter.id]}>
            {presenter.href ? (
              <a href={presenter.href} target="_blank" rel="sponsored noopener" className={styles.present}>
                {plate}
              </a>
            ) : (
              <span className={styles.present}>{plate}</span>
            )}
          </SponsorSeen>
        )}
      </div>

      {matches.length === 0 ? (
        <p className={styles.roundEmpty}>
          Το πρόγραμμα της {matchdayGenitive(matchday)} δεν έχει ανακοινωθεί ακόμη.
        </p>
      ) : (
        [...groups].map(([day, games]) => (
          <div key={day}>
            <h3 className={styles.day}>{day}</h3>
            {games.map((m) => (
              <Game key={m.id} match={m} />
            ))}
          </div>
        ))
      )}

      <Link href={`/agones?liga=${league.slug}&agonistiki=${matchday}`} className={styles.roundAll}>
        <span>Όλοι οι αγώνες της αγωνιστικής</span>
        <span aria-hidden="true">›</span>
      </Link>
    </section>
  );
}

function Game({ match }: { match: Match }) {
  const hs = match.home_score;
  const as = match.away_score;
  const scored = hs !== null && as !== null;
  const live = match.status === "live" || match.status === "halftime";
  const state = live
    ? match.minute
      ? `${match.minute}'`
      : "LIVE"
    : scored
      ? "ΤΕΛ."
      : match.status === "postponed"
        ? "ΑΝΑΒ."
        : match.status === "cancelled"
          ? "ΜΑΤ."
          : formatTime(match.kickoff_at) || "—";
  return (
    <Link href={`/agones/${match.id}`} className={styles.game}>
      <span className={`${styles.gameState} ${scored && !live ? styles.final : ""} ${live ? styles.live : ""}`}>
        {state}
      </span>
      <span className={styles.gameTeams}>
        <span className={scored && !live && hs! > as! ? styles.won : undefined}>
          <Crest team={match.home_team} size="xs" />
          <span>{match.home_team.name}</span>
        </span>
        <span className={scored && !live && as! > hs! ? styles.won : undefined}>
          <Crest team={match.away_team} size="xs" />
          <span>{match.away_team.name}</span>
        </span>
      </span>
      <span className={styles.gameScores}>
        <span>{hs ?? ""}</span>
        <span>{as ?? ""}</span>
      </span>
    </Link>
  );
}

const VERDICT: Record<string, string> = { Ν: "w", Ι: "d", Η: "l" };
const WORD: Record<string, string> = { Ν: "νίκη", Ι: "ισοπαλία", Η: "ήττα" };

/** The whole table: form as the last three results, promotion and relegation
 *  as a bar on the row's edge, and a legend under it. */
function Table({ standings, league }: { standings: Standing[]; league: League }) {
  const zones = new Set(standings.map((r) => r.zone).filter(Boolean));
  return (
    <section className={styles.block} aria-labelledby="table-title">
      <div className={styles.blockHead}>
        <h2 id="table-title" className={styles.h2}>
          Βαθμολογία
        </h2>
        <Link href={`/vathmologia?liga=${league.slug}`} className={styles.headLink}>
          Πλήρης ›
        </Link>
      </div>
      {standings.length === 0 ? (
        <Empty title="Χωρίς βαθμολογία" body="Η βαθμολογία εμφανίζεται μόλις παιχτεί η πρώτη αγωνιστική." />
      ) : (
        <div className={styles.card}>
          <div className={`${styles.tableRow} ${styles.tableHead}`} aria-hidden="true">
            <span>#</span>
            <span>ΟΜΑΔΑ</span>
            <span>ΦΟΡΜΑ</span>
            <span className={styles.r}>ΔΤ</span>
            <span className={styles.r}>Β</span>
          </div>
          <ol className={styles.tableList}>
            {standings.map((row) => {
              const form = (row.form ?? "").split("").filter((r) => r in VERDICT).slice(-3);
              return (
                <li key={row.team.id}>
                  <Link
                    href={`/somateia/${row.team.slug}`}
                    className={`${styles.tableRow} ${
                      row.zone === "promotion" ? styles.up : row.zone === "relegation" ? styles.down : ""
                    }`}
                  >
                    <span className={styles.pos}>{row.position}</span>
                    <span className={styles.club}>
                      <Crest team={row.team} size="xs" />
                      <span>{row.team.name}</span>
                    </span>
                    <span
                      className={styles.form}
                      role="img"
                      aria-label={form.length ? `Φόρμα: ${form.map((r) => WORD[r]).join(", ")}` : "Χωρίς φόρμα"}
                    >
                      {form.map((r, i) => (
                        <span key={i} className={`${styles.formBox} ${styles[VERDICT[r]]}`} aria-hidden="true">
                          {r}
                        </span>
                      ))}
                    </span>
                    <span className={`${styles.r} ${styles.gd}`}>{formatGoalDifference(row.goal_difference)}</span>
                    <span className={`${styles.r} ${styles.pts}`}>{row.points}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          {(zones.has("promotion") || zones.has("relegation")) && (
            <p className={styles.legend}>
              {zones.has("promotion") && (
                <span>
                  <span className={`${styles.legendBar} ${styles.upBar}`} aria-hidden="true" />
                  Άνοδος
                </span>
              )}
              {zones.has("relegation") && (
                <span>
                  <span className={`${styles.legendBar} ${styles.downBar}`} aria-hidden="true" />
                  Υποβιβασμός
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Scorers({ scorers, league }: { scorers: Scorer[]; league: League }) {
  if (scorers.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby="scorers-title">
      <div className={styles.blockHead}>
        <h2 id="scorers-title" className={styles.h2}>
          Σκόρερ
        </h2>
        <Link href={`/skorer?liga=${league.slug}`} className={styles.headLink}>
          Όλοι ›
        </Link>
      </div>
      <ol className={`${styles.card} ${styles.scorers}`}>
        {scorers.map((s, i) => (
          <li key={s.player.id}>
            <Link href={`/paiktes/${s.player.slug}`} className={styles.scorer}>
              <span className={styles.pos}>{i > 0 && scorers[i - 1].goals === s.goals ? "" : i + 1}</span>
              <span className={styles.scorerWho}>
                <span className={styles.scorerName}>{s.player.name}</span>
                {s.team && <span className={styles.scorerTeam}>{s.team.name}</span>}
              </span>
              <span className={styles.goals}>{s.goals ?? "–"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
