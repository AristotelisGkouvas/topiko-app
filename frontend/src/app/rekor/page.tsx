import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

import { SectionHeader } from "@/components/SectionHeader";
import { api } from "@/lib/api";
import { formatDayDate } from "@/lib/format";
import type { RecordMatch } from "@/lib/types";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ρεκόρ",
  description: "Τα άκρα του αρχείου: οι μεγαλύτερες νίκες και οι διαχρονικοί σκόρερ.",
};

export default async function RecordsPage() {
  const records = await api.getRecords();

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Ρεκόρ" />

      <dl className={styles.totals}>
        <Total
          value={records.total_matches.toLocaleString("el-GR")}
          label={records.total_matches === 1 ? "αγώνας" : "αγώνες"}
        />
        <Total value={records.total_goals.toLocaleString("el-GR")} label="γκολ" />
        <Total
          value={records.seasons_covered}
          label={records.seasons_covered === 1 ? "περίοδος" : "περίοδοι"}
        />
      </dl>

      <section>
        <SectionHeader title="Μεγαλύτερες διαφορές" />
        <RecordList rows={records.biggest_wins} unit="διαφορά" />
      </section>

      <section>
        <SectionHeader title="Περισσότερα γκολ σε έναν αγώνα" />
        <RecordList rows={records.highest_scoring} unit="γκολ" />
      </section>

      <section>
        <SectionHeader title="Διαχρονικοί σκόρερ" />
        <ul className={styles.list}>
          {records.top_scorers.map((scorer, index) => (
            <li key={scorer.player_id}>
              <Link
                href={`/paiktes/${scorer.player_slug}`}
                className={styles.scorerRow}
              >
                <span className={styles.rank}>{index + 1}</span>
                <span className={styles.scorerName}>{scorer.player_name}</span>
                <span className={styles.scorerGoals}>
                  {scorer.goals}
                  <span className={styles.unit}>
                    γκολ / {scorer.seasons} {scorer.seasons === 1 ? "περίοδος" : "περίοδοι"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Αθροισμένα από τις λίστες σκόρερ της ένωσης, άρα κατώτατο όριο: μια
          περίοδος χωρίς δημοσιευμένη λίστα δεν μετράει καθόλου.
        </p>
      </section>
    </div>
  );
}

function Total({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.total}>
      <dt className={styles.totalValue}>{value}</dt>
      <dd className={styles.totalLabel}>{label}</dd>
    </div>
  );
}

function RecordList({ rows, unit }: { rows: RecordMatch[]; unit: string }) {
  return (
    <ul className={styles.list}>
      {rows.map(({ match, value }) => (
        <li key={match.id}>
          <Link href={`/agones/${match.id}`} className={styles.row}>
            <span className={styles.badge}>
              {value}
              <span className={styles.unit}>{unit}</span>
            </span>
            <span className={styles.teams}>
              <span className={styles.line}>
                {match.home_team.name} {match.home_score}–{match.away_score}{" "}
                {match.away_team.name}
              </span>
              <span className={styles.date}>
                {formatDayDate(match.kickoff_at)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
