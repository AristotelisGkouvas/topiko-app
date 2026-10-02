import type { Metadata } from "next";
import Link from "next/link";

import { BandHeader } from "@/components/BandHeader";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { readParam, type SearchParams } from "@/lib/leagues";
import type { RecordMatch } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ρεκόρ",
  description: "Τα άκρα του αρχείου: οι μεγαλύτερες νίκες και οι διαχρονικοί σκόρερ.",
};

const dateFmt = new Intl.DateTimeFormat("el-GR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Athens",
});
const when = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "");

const FILTERS = [
  { id: undefined, label: "Όλα" },
  { id: "andres", label: "Ανδρικά" },
  { id: "ypodomes", label: "Υποδομές" },
] as const;

export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const asked = readParam(await searchParams, "eidos");
  const kind = asked === "andres" || asked === "ypodomes" ? asked : undefined;
  const records = await api.getRecords(kind);
  const top = records.biggest_wins[0] ?? null;
  const best = records.top_scorers[0]?.goals ?? 1;

  return (
    <div className={styles.page}>
      <BandHeader
        crumbs={[{ label: "Στατιστικά" }, { label: "Ρεκόρ" }]}
        title="Ρεκόρ"
        sub="Τα άκρα του αρχείου, από την αρχή του μέχρι σήμερα."
        aside={
          <nav className={styles.filters} aria-label="Κατηγορίες">
            {FILTERS.map((f) => (
              <Link
                key={f.label}
                href={f.id ? `/rekor?eidos=${f.id}` : "/rekor"}
                className={styles.filter}
                aria-current={kind === f.id ? "page" : undefined}
                scroll={false}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        }
        kpis={[
          { v: records.total_matches.toLocaleString("el-GR"), l: plural(records.total_matches, "αγώνας", "αγώνες") },
          { v: records.total_goals.toLocaleString("el-GR"), l: "γκολ" },
          { v: records.seasons_covered, l: plural(records.seasons_covered, "περίοδος", "περίοδοι") },
          ...(records.total_matches
            ? [
                {
                  v: (records.total_goals / records.total_matches).toFixed(1).replace(".", ","),
                  l: "γκολ ανά αγώνα",
                },
              ]
            : []),
        ]}
      />

      <div className={styles.body}>
        <div className={styles.main}>
          {top && (
            <Link href={`/agones/${top.match.id}`} className={styles.top}>
              <span className={styles.topLeft}>
                <span className={styles.topLabel}>ΤΟ ΡΕΚΟΡ</span>
                <span className={styles.topScore}>
                  {top.match.home_score}–{top.match.away_score}
                </span>
              </span>
              <span className={styles.topRight}>
                <span className={styles.topTeams}>
                  {top.match.home_team.name} – {top.match.away_team.name}
                </span>
                <span className={styles.topMeta}>
                  {[when(top.match.kickoff_at), top.league_name].filter(Boolean).join(" · ")}
                </span>
                <span className={styles.topNote}>
                  Η μεγαλύτερη διαφορά στο αρχείο: {top.value} γκολ
                </span>
              </span>
            </Link>
          )}

          <RecordList title="Μεγαλύτερες διαφορές" unit="ΔΙΑΦΟΡΑ" rows={records.biggest_wins} />
          <RecordList title="Περισσότερα γκολ σε αγώνα" unit="ΓΚΟΛ" rows={records.highest_scoring} />
        </div>

        <aside className={styles.side} aria-label="Διαχρονικοί σκόρερ">
          {records.top_scorers.length > 0 && (
            <section className={styles.block} aria-labelledby="scorers">
              <h2 id="scorers" className={styles.h2}>
                Διαχρονικοί σκόρερ
              </h2>
              <ol className={styles.card}>
                {records.top_scorers.map((s, i) => (
                  <li key={s.player_id}>
                    <Link href={`/paiktes/${s.player_slug}`} className={styles.scorer}>
                      <span className={styles.scorerTop}>
                        <span className={`${styles.rank} ${i === 0 ? styles.first : ""}`}>{i + 1}</span>
                        <span className={styles.scorerName}>{s.player_name}</span>
                        <span className={styles.scorerGoals}>{s.goals}</span>
                      </span>
                      <span className={styles.scorerBottom}>
                        <span />
                        <span className={styles.bar} aria-hidden="true">
                          <span style={{ width: `${Math.round((s.goals / best) * 100)}%` }} />
                        </span>
                        <span className={styles.scorerMeta}>
                          {s.seasons} περ. · {Math.round(s.goals / Math.max(1, s.seasons))}/περ.
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function RecordList({ title, unit, rows }: { title: string; unit: string; rows: RecordMatch[] }) {
  return (
    <section className={styles.block}>
      <h2 className={styles.h2}>{title}</h2>
      <div className={styles.card}>
        {rows.length === 0 ? (
          <p className={styles.empty}>Κανένας αγώνας σε αυτό το φίλτρο.</p>
        ) : (
          rows.map(({ match, value, league_name, youth }) => {
            const hs = match.home_score ?? 0;
            const as = match.away_score ?? 0;
            return (
              <Link key={match.id} href={`/agones/${match.id}`} className={styles.row}>
                <span className={styles.big}>
                  <span className={styles.bigNum}>{value}</span>
                  <span className={styles.bigUnit}>{unit}</span>
                </span>
                <span className={styles.lines}>
                  <span className={styles.line}>
                    <span className={hs > as ? styles.won : undefined}>{match.home_team.name}</span>
                    <span className={styles.s}>{hs}</span>
                  </span>
                  <span className={styles.line}>
                    <span className={as > hs ? styles.won : undefined}>{match.away_team.name}</span>
                    <span className={styles.s}>{as}</span>
                  </span>
                </span>
                <span className={styles.where}>
                  {league_name && (
                    <span className={`${styles.tag} ${youth ? "" : styles.men}`}>{league_name}</span>
                  )}
                  <span className={styles.date}>{when(match.kickoff_at)}</span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
