import type { Metadata } from "next";
import Link from "next/link";

import { BandHeader } from "@/components/BandHeader";
import { Icon } from "@/components/Icon";
import { ShareButton } from "@/components/ShareButton";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { readParam, type SearchParams } from "@/lib/leagues";
import type { Match } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Σαν σήμερα",
  description: "Τι έγινε τέτοια μέρα στα γήπεδα της Ηπείρου.",
};

const MONTHS = [
  "Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου", "Μαΐου", "Ιουνίου",
  "Ιουλίου", "Αυγούστου", "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου",
];

/** Where "Στείλ' τη μας" writes to; without it the note is not shown. */
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;

/** Today in Athens, as day and month. A plain function: it reads the clock. */
function athensToday(): { day: number; month: number; year: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" })
    .format(Date.now())
    .split("-")
    .map(Number);
  return { day: d, month: m, year: y };
}

/** The calendar day before or after, in a leap year so 29 Feb is a day too. */
function shift(day: number, month: number, by: number) {
  const d = new Date(Date.UTC(2024, month - 1, day + by));
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1 };
}

export default async function OnThisDayPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const today = athensToday();
  const asked = { day: Number(readParam(params, "mera")), month: Number(readParam(params, "minas")) };
  const valid =
    Number.isInteger(asked.day) && Number.isInteger(asked.month) && asked.month >= 1 && asked.month <= 12 && asked.day >= 1 && asked.day <= 31;
  const date = valid ? asked : { day: today.day, month: today.month };

  const data = await api.getOnThisDay({ ...date, limit: 50 });
  const matches = data.matches.filter((m) => m.kickoff_at && m.home_score !== null && m.away_score !== null);

  // Grouped by year, newest first, so the page reads as a set of
  // anniversaries; within a year the biggest result leads.
  const byYear = new Map<number, Match[]>();
  for (const m of matches) {
    const year = new Date(m.kickoff_at!).getFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), m]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  const goals = matches.reduce((s, m) => s + m.home_score! + m.away_score!, 0);
  const margin = (m: Match) => Math.abs(m.home_score! - m.away_score!);
  const top = matches.reduce<Match | null>((best, m) => (!best || margin(m) > margin(best) ? m : best), null);
  const most = matches.reduce<Match | null>(
    (best, m) => (!best || m.home_score! + m.away_score! > best.home_score! + best.away_score! ? m : best),
    null,
  );
  const awayWins = matches.filter((m) => m.away_score! > m.home_score!).length;

  const label = `${date.day} ${MONTHS[date.month - 1]}`;
  const prev = shift(date.day, date.month, -1);
  const next = shift(date.day, date.month, 1);
  const href = (d: { day: number; month: number }) =>
    d.day === today.day && d.month === today.month ? "/san-simera" : `/san-simera?mera=${d.day}&minas=${d.month}`;

  return (
    <div className={styles.page}>
      <BandHeader
        crumbs={[{ label: "Ένωση" }, { label: "Σαν σήμερα" }]}
        title="Σαν σήμερα"
        sub="Τι έγινε τέτοια μέρα στα γήπεδα της Ηπείρου."
        aside={
          <nav className={styles.dayNav} aria-label="Ημέρα">
            <Link href={href(prev)} className={styles.step} aria-label="Προηγούμενη μέρα" scroll={false}>
              ‹
            </Link>
            <span className={styles.today}>
              <Icon name="calendar" size={16} />
              {label}
            </span>
            <Link href={href(next)} className={styles.step} aria-label="Επόμενη μέρα" scroll={false}>
              ›
            </Link>
          </nav>
        }
        kpis={
          matches.length
            ? [
                { v: matches.length, l: plural(matches.length, "αγώνας", "αγώνες") },
                { v: years.length, l: plural(years.length, "χρονιά", "χρονιές") },
                { v: goals, l: "γκολ" },
                { v: (goals / matches.length).toFixed(1).replace(".", ","), l: "γκολ ανά αγώνα" },
              ]
            : []
        }
      />

      {matches.length === 0 ? (
        <div className={styles.body}>
          <Empty title="Χωρίς αγώνα" body={`Δεν υπάρχει καταγεγραμμένος αγώνας στις ${label} στο αρχείο.`} />
        </div>
      ) : (
        <div className={styles.body}>
          <div className={styles.main}>
            {years.map((year) => {
              const games = byYear.get(year)!;
              const ago = today.year - year;
              return (
                <section key={year} className={styles.year} aria-labelledby={`y${year}`}>
                  <div className={styles.yearHead}>
                    <h2 id={`y${year}`} className={styles.yearTitle}>
                      {year}
                    </h2>
                    <span className={styles.yearMeta}>
                      πριν {ago} {plural(ago, "χρόνο", "χρόνια")} · {games.length}{" "}
                      {plural(games.length, "αγώνας", "αγώνες")}
                    </span>
                  </div>
                  <div className={styles.card}>
                    {games.map((m) => (
                      <Link key={m.id} href={`/agones/${m.id}`} className={styles.game}>
                        <span className={styles.teams}>
                          <span className={m.home_score! > m.away_score! ? styles.won : undefined}>
                            {m.home_team.name}
                          </span>
                          <span className={m.away_score! > m.home_score! ? styles.won : undefined}>
                            {m.away_team.name}
                          </span>
                        </span>
                        <span className={styles.scores}>
                          <span>{m.home_score}</span>
                          <span>{m.away_score}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <aside className={styles.side} aria-label="Τα νούμερα της μέρας">
            {top && (
              <section className={styles.top} aria-labelledby="top">
                <h2 id="top" className={styles.topLabel}>
                  ΜΕΓΑΛΥΤΕΡΗ ΝΙΚΗ ΤΗΣ ΜΕΡΑΣ
                </h2>
                <span className={styles.topScore}>
                  <span>
                    {top.home_score}–{top.away_score}
                  </span>
                  <span className={styles.topYear}>{new Date(top.kickoff_at!).getFullYear()}</span>
                </span>
                <span className={styles.topTeams}>
                  {top.home_team.name} – {top.away_team.name}
                </span>
                <span className={styles.topActions}>
                  <Link href={`/agones/${top.id}`} className={styles.topButton}>
                    Φύλλο αγώνα
                  </Link>
                  <ShareButton
                    title={`Σαν σήμερα: ${top.home_team.name} ${top.home_score}–${top.away_score} ${top.away_team.name}`}
                    url={`/agones/${top.id}`}
                    className={styles.topButton}
                  />
                </span>
              </section>
            )}

            <section className={styles.block} aria-labelledby="facts">
              <h2 id="facts" className={styles.h2}>
                Τα νούμερα της μέρας
              </h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Πιο παλιός αγώνας</dt>
                  <dd>{years[years.length - 1]}</dd>
                </div>
                {most && (
                  <div>
                    <dt>Περισσότερα γκολ σε αγώνα</dt>
                    <dd>
                      {most.home_score! + most.away_score!} · {most.home_team.name} {most.home_score}–{most.away_score}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Νίκες εκτός έδρας</dt>
                  <dd>
                    {awayWins} από {matches.length}
                  </dd>
                </div>
              </dl>
            </section>

            {CONTACT && (
              <p className={styles.note}>
                Έχεις φωτογραφία ή ιστορία από κάποιον από αυτούς τους αγώνες;{" "}
                <a href={`mailto:${CONTACT}?subject=${encodeURIComponent(`Σαν σήμερα, ${label}`)}`}>Στείλ’ τη μας</a>.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
