import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Crest } from "@/components/Crest";
import { ShareButton } from "@/components/ShareButton";
import { ApiError, api } from "@/lib/api";
import { formatDayDate, plural, upper } from "@/lib/format";
import type { PlayerDetail, TeamRef } from "@/lib/types";
import pageStyles from "../../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<PlayerDetail> {
  try {
    return await api.getPlayer(slug);
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
    const player = await load(slug);
    const club = (player.sheet_seasons.find((l) => l.team)?.team ?? player.clubs[0])?.name;
    return {
      title: player.name,
      description: player.appearances_total
        ? `${player.appearances_total} ${plural(player.appearances_total, "συμμετοχή", "συμμετοχές")}${
            sheetGoals(player) ? `, ${sheetGoals(player)} γκολ` : ""
          }${club ? ` · ${club}` : ""}`
        : player.total_goals
          ? `${player.total_goals} γκολ σε ${player.seasons_scored} ${plural(player.seasons_scored, "περίοδο", "περιόδους")}${club ? ` · ${club}` : ""}`
          : club,
      alternates: { canonical: `/paiktes/${slug}` },
      // Fifteen thousand names with no goal against them are the thin pages
      // the sitemap already leaves out; this keeps them out of the index too.
      // Indexed once there is something to read: a goal on a published list,
      // or a match on a report. The rest are names and nothing else.
      ...(!player.total_goals && !player.live_goals && !player.appearances_total && {
        robots: { index: false, follow: true },
      }),
    };
  } catch {
    return { title: "Παίκτης" };
  }
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const player = await load(slug);

  const lines = player.sheet_seasons;
  const current = lines.find((l) => l.season.is_current) ?? null;
  // The club of the newest report, when there is one: the register's list of
  // clubs is not in the order they were played for.
  const club = lines.find((l) => l.team)?.team ?? player.clubs[0] ?? null;
  const apps = player.appearances_total;
  const minutes = minutesTotal(player);
  const goals = Math.max(player.total_goals, sheetGoals(player));
  const age = player.birth_year ? new Date().getFullYear() - player.birth_year : null;
  const longest = Math.max(1, ...lines.map((l) => l.minutes));
  const seasonCount = new Set(lines.map((l) => l.season.slug)).size;

  const career = path(lines);
  const clubCount = Math.max(career.length, player.clubs.length);

  const kpis: { v: string; l: string }[] = [
    ...(apps > 0
      ? [
          { v: fmt(apps), l: plural(apps, "συμμετοχή", "συμμετοχές") },
          { v: fmt(minutes), l: "λεπτά" },
          { v: `${Math.round(minutes / apps)}'`, l: "μέσος όρος ανά αγώνα" },
        ]
      : []),
    { v: fmt(goals), l: "γκολ" },
    { v: fmt(clubCount), l: plural(clubCount, "σωματείο", "σωματεία") },
    // Counted apart: the federation's lists are the record, these are what
    // volunteers logged at the ground with this name.
    ...(player.live_goals > 0
      ? [{ v: fmt(player.live_goals), l: "γκολ από τα γήπεδα (ανεπίσημα)" }]
      : []),
  ];

  return (
    <div className={`${pageStyles.page} ${styles.wrap}`}>
      <nav className={styles.crumbs} aria-label="Διαδρομή">
        <span>Στατιστικά</span>
        <span aria-hidden="true">›</span>
        <Link href="/paiktes">Παίκτες</Link>
        <span aria-hidden="true">›</span>
        <span className={styles.here} aria-current="page">
          {player.name}
        </span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.top}>
          <div className={styles.who}>
            <span className={styles.initials} aria-hidden="true">
              {initials(player.name)}
            </span>
            <div className={styles.ident}>
              <h1 className={styles.name}>{player.name}</h1>
              <div className={styles.meta}>
                {club ? (
                  <Link href={`/somateia/${club.slug}`} className={styles.pill}>
                    <Crest team={club} size="xs" />
                    {club.name}
                  </Link>
                ) : (
                  <span>Χωρίς καταγεγραμμένο σωματείο</span>
                )}
                {current && <span>{current.league_name}</span>}
                {player.birth_year && (
                  <>
                    {current && <span className={styles.dot} aria-hidden="true">·</span>}
                    <span>
                      γεν. {player.birth_year}
                      {age ? ` (${age} ετών)` : ""}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <ShareButton
            title={player.name}
            text={[player.name, club?.name, apps ? `${apps} συμμετοχές` : null, goals ? `${goals} γκολ` : null]
              .filter(Boolean)
              .join(" · ")}
            className={styles.share}
          />
        </div>
        <dl className={styles.kpis}>
          {kpis.map((k) => (
            <div key={k.l} className={styles.kpi}>
              <dt className={styles.kpiValue}>{k.v}</dt>
              <dd className={styles.kpiLabel}>{k.l}</dd>
            </div>
          ))}
        </dl>
      </header>

      {career.length > 0 && (
        <section className={styles.block} aria-labelledby="path">
          <h2 id="path" className={styles.h2}>
            Πορεία
          </h2>
          <ol className={styles.path}>
            {career.map((c) => (
              <li key={c.team.id}>
                <Link
                  href={`/somateia/${c.team.slug}`}
                  className={`${styles.stop} ${c.now ? styles.stopNow : ""}`}
                >
                  <Crest team={c.team} size="md" />
                  <span className={styles.stopText}>
                    <span className={styles.stopName}>{c.team.name}</span>
                    <span className={styles.stopMeta}>
                      {c.years} · {c.apps} συμμ.
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {lines.length > 0 && (
        <section className={styles.block} aria-labelledby="by-season">
          <div className={styles.blockHead}>
            <h2 id="by-season" className={styles.h2}>
              Ανά σεζόν
            </h2>
            <span className={styles.source}>Από τα φύλλα αγώνα της ένωσης</span>
          </div>
          <div className={styles.seasonWrap}>
            <table className={styles.seasons}>
              <thead>
                <tr>
                  <th scope="col">ΣΕΖΟΝ</th>
                  <th scope="col">ΣΩΜΑΤΕΙΟ · ΚΑΤΗΓΟΡΙΑ</th>
                  <th scope="col" className={styles.r}>ΣΥΜΜ.</th>
                  <th scope="col" className={styles.r}>ΒΑΣΙΚΟΣ</th>
                  <th scope="col">ΛΕΠΤΑ</th>
                  <th scope="col" className={styles.r}>ΓΚΟΛ</th>
                  <th scope="col" className={styles.r}>ΚΑΡΤΕΣ</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const repeat = i > 0 && lines[i - 1].season.slug === l.season.slug;
                  return (
                    <tr
                      key={`${l.season.slug}-${l.league_slug}-${l.team?.id ?? i}`}
                      className={l.season.is_current ? styles.now : undefined}
                    >
                      <th scope="row" className={styles.seasonCell}>
                        {repeat ? (
                          <span className="srOnly">{l.season.slug}</span>
                        ) : (
                          <>
                            {l.season.slug}
                            {l.season.is_current && <span className={styles.nowTag}>ΤΩΡΑ</span>}
                          </>
                        )}
                      </th>
                      <td>
                        <span className={styles.clubCell}>
                          {l.team ? (
                            <>
                              <Crest team={l.team} size="sm" />
                              <Link href={`/somateia/${l.team.slug}`} className={styles.clubLink}>
                                {l.team.name}
                              </Link>
                            </>
                          ) : (
                            "—"
                          )}
                          <span className={styles.chip}>{l.league_name}</span>
                        </span>
                      </td>
                      <td className={`${styles.r} ${styles.strong}`}>{l.apps}</td>
                      <td className={styles.r}>{dash(l.starts)}</td>
                      <td>
                        <span className={styles.minutes}>
                          <span className={styles.bar} aria-hidden="true">
                            <span style={{ width: `${Math.round((l.minutes / longest) * 100)}%` }} />
                          </span>
                          <span className={styles.minNum}>{fmt(l.minutes)}</span>
                        </span>
                      </td>
                      <td className={`${styles.r} ${l.goals ? styles.scored : styles.zero}`}>
                        {dash(l.goals)}
                      </td>
                      <td className={styles.r}>
                        <span className={styles.cards}>
                          {l.yellow > 0 && (
                            <span title="Κίτρινες">
                              <span className={`${styles.card} ${styles.yellow}`} aria-hidden="true" />
                              {l.yellow}
                            </span>
                          )}
                          {l.red > 0 && (
                            <span title="Κόκκινες">
                              <span className={`${styles.card} ${styles.red}`} aria-hidden="true" />
                              {l.red}
                            </span>
                          )}
                          {!l.yellow && !l.red && <span className={styles.zero}>–</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">ΣΥΝΟΛΟ</th>
                  <td className={styles.footNote}>
                    {career.length} {plural(career.length, "σωματείο", "σωματεία")} · {seasonCount}{" "}
                    {plural(seasonCount, "σεζόν", "σεζόν")}
                  </td>
                  <td className={styles.r}>{fmt(apps)}</td>
                  <td />
                  <td className={styles.r}>{fmt(minutes)}</td>
                  <td className={styles.r}>{sheetGoals(player)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {player.appearances.length > 0 && (
        <section className={styles.block} aria-labelledby="games">
          <h2 id="games" className={styles.h2}>
            Αγώνες
          </h2>
          <ul className={styles.games}>
            {player.appearances.slice(0, 30).map((a) => (
              <li key={a.match_id}>
                <Link href={`/agones/${a.match_id}`} className={styles.game}>
                  <span className={styles.gameDate}>
                    {a.kickoff_at ? formatDayDate(a.kickoff_at) : a.season.slug}
                  </span>
                  <span className={styles.gameVs}>
                    {a.home ? "εντός" : "εκτός"} με {a.opponent?.name ?? "—"}
                  </span>
                  <span className={`${styles.gameScore} ${verdictClass(a.goals_for, a.goals_against)}`}>
                    {a.goals_for ?? "–"}–{a.goals_against ?? "–"}
                  </span>
                  <span className={styles.gameMe}>
                    {a.minutes}′{a.goals ? ` · ${a.goals} γκολ` : ""}
                    {a.red ? " · αποβολή" : a.yellow ? " · κίτρινη" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {player.appearances_total > 30 && (
            <p className={styles.note}>
              Οι 30 πιο πρόσφατοι από {player.appearances_total} αγώνες.
            </p>
          )}
        </section>
      )}

      {player.seasons.length > 0 && (
        <section className={styles.block} aria-labelledby="scorer-lists">
          <h2 id="scorer-lists" className={styles.h2}>
            Γκολ στις λίστες σκόρερ
          </h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Περίοδος</th>
                  <th scope="col">Διοργάνωση</th>
                  <th scope="col">Σωματείο</th>
                  <th scope="col" className={styles.num}>
                    <abbr title="Γκολ">Γ</abbr>
                  </th>
                </tr>
              </thead>
              <tbody>
                {player.seasons.map((line, index) => (
                  <tr key={`${line.season.slug}-${line.league_slug}-${index}`}>
                    <td className={styles.season}>{line.season.slug}</td>
                    <td>
                      <Link
                        href={`/skorer?liga=${line.league_slug}&periodos=${line.season.slug}`}
                        className={styles.leagueLink}
                      >
                        {line.league_name}
                      </Link>
                    </td>
                    <td className={styles.teamCell}>
                      {line.team ? (
                        <Link href={`/somateia/${line.team.slug}`} className={styles.teamLink}>
                          {line.team.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={`${styles.num} ${styles.goals}`}>{line.goals ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>
            Από τις λίστες σκόρερ της ένωσης, που έχουν μόνο τους πρώτους κάθε
            λίστας, οπότε είναι <strong>κατώτατο όριο</strong>. Τα «Ανά σεζόν» και
            «Αγώνες» βγαίνουν από τα φύλλα αγώνα, που το site διαβάζει έναν έναν:
            όσο γεμίζει το αρχείο, μεγαλώνουν.
          </p>
        </section>
      )}

      {lines.length === 0 && player.seasons.length === 0 && (
        <p className={styles.note}>Δεν υπάρχει ακόμη καταγεγραμμένη συμμετοχή για αυτόν τον παίκτη.</p>
      )}
    </div>
  );
}

/** The score chip's colour: won, drawn or lost, from the player's side. */
function verdictClass(us: number | null, them: number | null): string {
  if (us === null || them === null) return "";
  return us > them ? styles.gameWin : us < them ? styles.gameLoss : styles.gameDraw;
}

const fmt = (n: number) => n.toLocaleString("el-GR");

/** A zero as a dash: in a column of numbers, "nothing" reads faster. */
const dash = (n: number) => (n === 0 ? "–" : n);

/** "ΦΩΤΟΣ ΓΕΩΡΓΙΟΣ" → "ΦΓ": surname and first name, as on the register. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => upper(w[0]))
    .join("");
}

/** The clubs in the order played for, oldest first, each with its span of
 *  seasons and appearances, the current one marked. */
function path(lines: PlayerDetail["sheet_seasons"]) {
  const byTeam = new Map<number, { team: TeamRef; first: number; last: number; apps: number; now: boolean }>();
  for (const l of lines) {
    if (!l.team) continue;
    const start = Number.parseInt(l.season.slug, 10);
    const entry = byTeam.get(l.team.id) ?? { team: l.team, first: start, last: start, apps: 0, now: false };
    entry.first = Math.min(entry.first, start);
    entry.last = Math.max(entry.last, start);
    entry.apps += l.apps;
    entry.now ||= l.season.is_current;
    byTeam.set(l.team.id, entry);
  }
  return [...byTeam.values()]
    .sort((a, b) => a.first - b.first || a.last - b.last)
    .map((c) => ({
      ...c,
      years: c.now
        ? `από ${c.first}`
        : c.first === c.last
          ? `${c.first}-${String(c.first + 1).slice(2)}`
          : `${c.first}–${c.last + 1}`,
    }));
}

/** Goals counted from the match reports the site has read. */
function sheetGoals(player: PlayerDetail): number {
  return player.sheet_seasons.reduce((sum, line) => sum + line.goals, 0);
}

function minutesTotal(player: PlayerDetail): number {
  return player.sheet_seasons.reduce((sum, line) => sum + line.minutes, 0);
}
