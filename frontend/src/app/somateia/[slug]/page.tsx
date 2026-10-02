import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClubActions } from "@/components/ClubActions";
import { ClubSponsorCarousel, type SponsorCard } from "@/components/ClubSponsorCarousel";
import { Crest } from "@/components/Crest";
import { Gallery } from "@/components/Gallery";
import { GoalMinutes } from "@/components/GoalMinutes";
import { splitRecord } from "@/components/HomeAway";
import { Icon } from "@/components/Icon";
import { SeasonPicker } from "@/components/SeasonPicker";
import { SponsorSeen } from "@/components/SponsorSeen";
import { Empty } from "@/components/States";
import { ApiError, api, sponsorHref } from "@/lib/api";
import { formatDayDate, formatGoalDifference, formatTime, plural } from "@/lib/format";
import { leagueLabel, readParam, type SearchParams } from "@/lib/leagues";
import { mediaUrl } from "@/lib/media";
import { JsonLd, absolute, breadcrumbs } from "@/lib/seo";
import type { FieldRef, Match, Standing, TeamDetail } from "@/lib/types";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const [team, placement] = await Promise.all([
      api.getTeam(slug),
      api.getTeamStanding(slug).catch(() => null),
    ]);
    // What a search result should say under the name: the division and where
    // they stand, not the site's tagline repeated on 177 pages.
    const where = placement
      ? `${placement.league.short_name ?? placement.league.name}, ${placement.standing.position}η θέση με ${placement.standing.points} ${plural(placement.standing.points, "βαθμό", "βαθμούς")}`
      : null;
    return {
      title: `${team.name}: αποτελέσματα, πρόγραμμα, βαθμολογία`,
      description: [
        `${team.name}: πρόγραμμα, αποτελέσματα και βαθμολογία`,
        where,
        team.home_field ? `έδρα ${team.home_field.name}` : null,
      ]
        .filter(Boolean)
        .join(" · ") + ".",
      alternates: { canonical: `/somateia/${slug}` },
    };
  } catch {
    return { title: "Σωματείο" };
  }
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
    api.getTeamStanding(slug, season),
    api.getTeamMatches(slug, season),
  ]);
  // A table that failed to load costs its box, not the page.
  const table = placement
    ? await api.getStandings(placement.league.slug, season).catch(() => [])
    : [];

  const standing = placement?.standing;
  const played = matches.filter(
    (m) => m.home_score !== null && m.away_score !== null,
  );
  // "No score" is not the same as "still to come": whole youth divisions are
  // never scored, so on an archived season every fixture the club ever played
  // qualified and "Επόμενοι αγώνες" filled up with matches from 2016.
  const upcoming = stillToCome(matches);
  // Postponed and not yet replayed: owed games, which "Επόμενοι" (dated,
  // in the future) never showed.
  const pending = matches.filter(
    (m) => m.status === "postponed" && m.home_score === null,
  );

  const next = upcoming[0] ?? null;
  const later = upcoming.slice(1);
  const recent = played.slice(-5).reverse();
  const split = played.length > 0 ? splitRecord(team, played) : null;
  const form = (standing?.form ?? "").split("").filter((r) => r in VERDICT).slice(-5);
  const around = nearby(table, team.id);

  // Through the API's redirect, which counts the click for the renewal.
  const sponsorCards: SponsorCard[] = await Promise.all(
    team.sponsors.map(async (s) => ({
      id: s.id,
      name: s.name,
      logo: mediaUrl(s.logo_url),
      href: s.website_url ? await sponsorHref("club", s.id) : null,
      site: host(s.website_url),
    })),
  );

  return (
    <div className={styles.page}>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            name: team.name,
            url: absolute(`/somateia/${team.slug}`),
            sport: "Soccer",
            // Uploads are stored as "/api/media/…", served from the site's own host.
            ...(team.logo_url && {
              logo: /^https?:\/\//.test(team.logo_url) ? team.logo_url : absolute(team.logo_url),
            }),
            ...(team.founded_year && { foundingDate: String(team.founded_year) }),
            ...(team.city && { location: { "@type": "Place", name: team.city } }),
            memberOf: { "@type": "SportsOrganization", name: "ΕΠΣ Ηπείρου" },
          },
          breadcrumbs([
            { name: "Σωματεία", path: "/somateia" },
            { name: team.name, path: `/somateia/${team.slug}` },
          ]),
        ]}
      />

      {/* The white band: who they are, what a supporter does here, and the
          numbers with the form that explains them. */}
      <header
        className={styles.hero}
        style={
          team.primary_color
            ? ({ "--club-1": team.primary_color } as React.CSSProperties)
            : undefined
        }
      >
        <div className={styles.heroInner}>
          <div className={styles.headRow}>
            <div className={styles.identity}>
              <span className={styles.crest}>
                <Crest team={team} size="lg" />
              </span>
              <div className={styles.names}>
                <h1 className={styles.name}>{team.name}</h1>
                <div className={styles.meta}>
                  {placement && <span className={styles.leagueChip}>{leagueLabel(placement.league)}</span>}
                  {team.home_field && <span>Έδρα: {team.home_field.city ?? team.home_field.name}</span>}
                  {team.founded_year && <span>Ιδρ. {team.founded_year}</span>}
                  {team.seasons.length > 1 && (
                    <SeasonPicker
                      seasons={team.seasons.map((s) => ({
                        slug: s,
                        name: s,
                        // The club's own seasons, so "current" here means the
                        // latest it played, not the one the federation runs.
                        is_current: s === team.seasons[0],
                      }))}
                      active={season}
                      markerLabel="τελευταία"
                      compact
                    />
                  )}
                </div>
              </div>
            </div>
            <div className={styles.actions}>
              <ClubActions slug={team.slug} name={team.name} shareTitle={team.name} />
            </div>
          </div>

          {standing && (
            <dl className={styles.kpis}>
              <Kpi value={`${standing.position}η`} label="θέση" />
              <Kpi value={standing.points} label={plural(standing.points, "βαθμός", "βαθμοί")} />
              {/* Words, not "32:28": a ratio has to be decoded. */}
              <Kpi value={`${standing.goals_for}–${standing.goals_against}`} label="γκολ υπέρ–κατά" />
              <Kpi value={formatGoalDifference(standing.goal_difference)} label="διαφορά" />
              {form.length > 0 && (
                <div className={styles.kpi}>
                  <dt className={styles.kpiLabel}>φόρμα · πιο πρόσφατο δεξιά</dt>
                  <dd className={styles.form}>
                    <span
                      role="img"
                      aria-label={`Φόρμα: ${form.map((r) => VERDICT[r].word).join(", ")}`}
                      className={styles.formRow}
                    >
                      {form.map((r, i) => (
                        <span key={i} className={`${styles.verdict} ${styles[VERDICT[r].tone]}`} aria-hidden="true">
                          {r}
                        </span>
                      ))}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {sponsorCards.length > 0 && (
          <section className={styles.full} aria-labelledby="sponsors">
            <div className={styles.blockHead}>
              <h2 id="sponsors" className={styles.h2}>
                Χορηγοί ομάδας
              </h2>
              <span className={styles.aside}>
                {sponsorCards.length === 1
                  ? "στηρίζει το σωματείο"
                  : `${sponsorCards.length} επιχειρήσεις στηρίζουν το σωματείο`}
              </span>
            </div>
            <SponsorSeen club={sponsorCards.map((s) => s.id)}>
              <ClubSponsorCarousel cards={sponsorCards} />
            </SponsorSeen>
          </section>
        )}

        <div className={styles.main}>
          {next && <NextMatch match={next} teamId={team.id} />}

          <div className={styles.pair}>
            <section className={styles.block} aria-labelledby="fixtures">
              <h2 id="fixtures" className={styles.h2}>
                Πρόγραμμα
              </h2>
              {later.length > 0 ? (
                <div className={styles.card}>
                  {later.slice(0, 4).map((m) => (
                    <Fixture key={m.id} match={m} teamId={team.id} />
                  ))}
                  {later.length > 4 && (
                    <details className={styles.more}>
                      <summary className={styles.moreLink}>
                        <span>Όλο το πρόγραμμα</span>
                        <span aria-hidden="true">›</span>
                      </summary>
                      {later.slice(4).map((m) => (
                        <Fixture key={m.id} match={m} teamId={team.id} />
                      ))}
                    </details>
                  )}
                </div>
              ) : (
                <Empty title={next ? "Κανένας άλλος προγραμματισμένος αγώνας" : "Κανένας προγραμματισμένος αγώνας"} />
              )}

              {pending.length > 0 && (
                <>
                  <h2 className={`${styles.h2} ${styles.h2Gap}`}>Εκκρεμούν</h2>
                  <div className={styles.card}>
                    {pending.map((m) => (
                      <Fixture key={m.id} match={m} teamId={team.id} />
                    ))}
                  </div>
                </>
              )}
            </section>

            <div className={styles.stack}>
              <section className={styles.block} aria-labelledby="results">
                <h2 id="results" className={styles.h2}>
                  Αποτελέσματα
                </h2>
                {recent.length > 0 ? (
                  <div className={styles.card}>
                    {recent.map((m) => (
                      <Result key={m.id} match={m} teamId={team.id} />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Κανένα αποτέλεσμα"
                    body={season ? `Δεν υπάρχουν καταχωρημένα αποτελέσματα για την περίοδο ${season}.` : undefined}
                  />
                )}
              </section>

              {split && (
                <section className={styles.block} aria-labelledby="homeaway">
                  <h2 id="homeaway" className={styles.h2}>
                    Εντός / Εκτός
                  </h2>
                  <table className={`${styles.card} ${styles.split}`}>
                    <thead>
                      <tr>
                        <th scope="col">
                          <span className="srOnly">Πού</span>
                        </th>
                        <th scope="col" title="Αγώνες">ΑΓ</th>
                        <th scope="col" title="Νίκες">Ν</th>
                        <th scope="col" title="Ισοπαλίες">Ι</th>
                        <th scope="col" title="Ήττες">Η</th>
                        <th scope="col">ΓΚΟΛ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Εντός", split.home],
                          ["Εκτός", split.away],
                        ] as const
                      ).map(([k, s]) => (
                        <tr key={k}>
                          <th scope="row">{k}</th>
                          <td>{s.played}</td>
                          <td>{s.won}</td>
                          <td>{s.drawn}</td>
                          <td>{s.lost}</td>
                          <td>
                            {s.scored}–{s.conceded}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </div>
          </div>

          {team.photos.length > 0 && (
            <section className={styles.block} aria-labelledby="photos">
              <h2 id="photos" className={styles.h2}>
                Φωτογραφίες
              </h2>
              <Gallery photos={team.photos} name={team.name} />
            </section>
          )}
        </div>

        <aside className={styles.side} aria-label="Βαθμολογία και σωματείο">
          {placement && around.length > 0 && (
            <section className={styles.block} aria-labelledby="table">
              <div className={styles.blockHead}>
                <h2 id="table" className={styles.h2}>
                  Βαθμολογία
                </h2>
                <Link href={`/vathmologia?liga=${placement.league.slug}`} className={styles.headLink}>
                  Πλήρης ›
                </Link>
              </div>
              <div className={styles.card}>
                {around.map((r) => (
                  <Link
                    key={r.team.id}
                    href={`/somateia/${r.team.slug}`}
                    className={`${styles.tableRow} ${r.team.id === team.id ? styles.me : ""}`}
                    aria-current={r.team.id === team.id ? "page" : undefined}
                  >
                    <span>{r.position}</span>
                    <span className={styles.tableName}>{r.team.name}</span>
                    <span className={styles.gd}>{formatGoalDifference(r.goal_difference)}</span>
                    <span className={styles.pts}>{r.points}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className={styles.block} aria-labelledby="club">
            <h2 id="club" className={styles.h2}>
              Σωματείο
            </h2>
            <nav className={styles.card} aria-label="Σωματείο">
              <ClubLink href={`/somateia/${team.slug}/roster`} title="Ρόστερ" sub="Παίκτες και στατιστικά">
                <Icon name="person" size={18} />
              </ClubLink>
              <ClubLink href={`/poines?somateio=${team.slug}`} title="Ποινές" sub="Κάρτες και τιμωρίες">
                <span className={styles.cardGlyph} />
              </ClubLink>
              {team.home_field && (
                <ClubLink
                  href={`/gipeda/${team.home_field.slug}`}
                  title={team.home_field.name}
                  sub={venueLine(team.home_field)}
                >
                  <Icon name="pin" size={18} />
                </ClubLink>
              )}
            </nav>
          </section>

          <GoalMinutes slug={team.slug} title="ΓΚΟΛ ΑΝΑ 15ΛΕΠΤΟ" />

        </aside>

        {/* The one place a club official would look. The tool is not in the
            nav — it is not for readers — but a door nobody can find is not
            a door. */}
        <p className={styles.volunteer}>
          Είσαι από το σωματείο; Δώσε το σκορ{" "}
          <Link href="/ethelontis">live από το γήπεδο</Link> με τον κωδικό που σου
          έδωσε η ένωση.
        </p>
      </div>
    </div>
  );
}

const VERDICT: Record<string, { word: string; tone: "w" | "d" | "l" }> = {
  Ν: { word: "νίκη", tone: "w" },
  Ι: { word: "ισοπαλία", tone: "d" },
  Η: { word: "ήττα", tone: "l" },
};

function Kpi({ value, label }: { value: string | number; label: string }) {
  return (
    // dt before dd, as a <dl> requires; reversed in CSS so the number is on top.
    <div className={styles.kpi}>
      <dt className={styles.kpiLabel}>{label}</dt>
      <dd className={styles.kpiValue}>{value}</dd>
    </div>
  );
}

/** "ΣΕ 2 ΜΕΡΕΣ", "ΣΗΜΕΡΑ", "ΑΥΡΙΟ" — counted in Athens days. A plain
 *  function: it reads the clock, which a component body must not. */
function daysAway(iso: string | null): string | null {
  if (!iso) return null;
  const day = (t: number) => Math.floor((t + 3 * 3600_000) / 86_400_000);
  const n = day(new Date(iso).getTime()) - day(Date.now());
  if (n <= 0) return "ΣΗΜΕΡΑ";
  if (n === 1) return "ΑΥΡΙΟ";
  return `ΣΕ ${n} ΜΕΡΕΣ`;
}

/** The navy card: the next match, big, with what to read before it. */
function NextMatch({ match, teamId }: { match: Match; teamId: number }) {
  const home = match.home_team.id === teamId;
  const opponent = home ? match.away_team : match.home_team;
  const when = [formatDayDate(match.kickoff_at), daysAway(match.kickoff_at)].filter(Boolean).join(" · ");
  return (
    <section className={styles.next} aria-labelledby="next">
      <div className={styles.nextTop}>
        <h2 id="next" className={styles.nextLabel}>
          ΕΠΟΜΕΝΟΣ ΑΓΩΝΑΣ{match.matchday ? ` · ${match.matchday}η ΑΓΩΝΙΣΤΙΚΗ` : ""}
        </h2>
        {when && <span className={styles.nextWhen}>{when}</span>}
      </div>
      <Link href={`/agones/${match.id}`} className={styles.nextBoard}>
        <span className={styles.nextSide}>
          <Crest team={match.home_team} size="md" onNavy />
          <span>{match.home_team.name}</span>
        </span>
        <span className={styles.nextTime}>{formatTime(match.kickoff_at) || "–"}</span>
        <span className={`${styles.nextSide} ${styles.nextAway}`}>
          <span>{match.away_team.name}</span>
          <Crest team={match.away_team} size="md" onNavy />
        </span>
      </Link>
      <div className={styles.nextFoot}>
        <span className={styles.nextWhere}>
          {[match.field?.name, home ? "εντός έδρας" : "εκτός έδρας"].filter(Boolean).join(" · ")}
        </span>
        <span className={styles.nextActions}>
          <Link href={`/kontra/${match.home_team.slug}/${match.away_team.slug}`} className={styles.nextButton}>
            Κόντρα
          </Link>
          <Link
            href={`/somateia/${opponent.slug}/analysi?me=${home ? match.home_team.slug : match.away_team.slug}`}
            className={styles.nextButton}
          >
            Ανάλυση αντιπάλου
          </Link>
        </span>
      </div>
    </section>
  );
}

/** One fixture: the date as a block, the opponent and ground, the time and
 *  which end. */
function Fixture({ match, teamId }: { match: Match; teamId: number }) {
  const home = match.home_team.id === teamId;
  const opponent = home ? match.away_team : match.home_team;
  const [day, date] = formatDayDate(match.kickoff_at).split(" ");
  return (
    <Link href={`/agones/${match.id}`} className={styles.fixture}>
      <span className={styles.date}>
        <span>{day ? day.charAt(0) + day.slice(1).toLocaleLowerCase("el-GR") : "—"}</span>
        <span className={styles.dateNum}>{date ?? ""}</span>
      </span>
      <span className={styles.fixtureMid}>
        <span className={styles.opponent}>
          <Crest team={opponent} size="xs" />
          <span>{opponent.name}</span>
        </span>
        {match.field && <span className={styles.venue}>{match.field.name}</span>}
      </span>
      <span className={styles.fixtureEnd}>
        <span className={styles.time}>
          {match.status === "postponed" ? "ΑΝΑΒΟΛΗ" : formatTime(match.kickoff_at) || "—"}
        </span>
        <span className={home ? styles.homeTag : styles.awayTag}>{home ? "ΕΝΤΟΣ" : "ΕΚΤΟΣ"}</span>
      </span>
    </Link>
  );
}

/** One result: both clubs as played, the winner in bold, and Ν/Ι/Η from
 *  this club's side. */
function Result({ match, teamId }: { match: Match; teamId: number }) {
  const hs = match.home_score ?? 0;
  const as = match.away_score ?? 0;
  const ours = match.home_team.id === teamId ? hs - as : as - hs;
  const r = ours > 0 ? "Ν" : ours < 0 ? "Η" : "Ι";
  return (
    <Link href={`/agones/${match.id}`} className={styles.result}>
      <span className={styles.resultTeams}>
        <span className={hs > as ? styles.won : undefined}>
          <Crest team={match.home_team} size="xs" />
          {match.home_team.name}
        </span>
        <span className={as > hs ? styles.won : undefined}>
          <Crest team={match.away_team} size="xs" />
          {match.away_team.name}
        </span>
      </span>
      <span className={styles.resultScores}>
        <span>{hs}</span>
        <span>{as}</span>
      </span>
      <span className={`${styles.verdict} ${styles[VERDICT[r].tone]}`} aria-label={VERDICT[r].word}>
        {r}
      </span>
    </Link>
  );
}

function ClubLink({
  href,
  title,
  sub,
  children,
}: {
  href: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={styles.clubLink}>
      <span className={styles.clubGlyph} aria-hidden="true">
        {children}
      </span>
      <span className={styles.clubText}>
        <span className={styles.clubTitle}>{title}</span>
        <span className={styles.clubSub}>{sub}</span>
      </span>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

/** Five rows of the table around the club: two above, two below, fewer at
 *  either end. */
function nearby(rows: Standing[], teamId: number): Standing[] {
  const i = rows.findIndex((r) => r.team.id === teamId);
  if (i < 0) return [];
  const start = Math.max(0, Math.min(i - 2, rows.length - 5));
  return rows.slice(start, start + 5);
}

/** "www.ktep.gr" from "https://www.ktep.gr/…": the card's second line. */
function host(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
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
      // A postponed match is listed under "Εκκρεμούν"; showing it here too
      // put the same fixture on the page twice.
      m.status !== "postponed" &&
      (m.kickoff_at === null || new Date(m.kickoff_at).getTime() >= now),
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
