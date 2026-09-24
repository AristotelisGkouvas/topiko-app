import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

import { SectionHeader } from "@/components/SectionHeader";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import pageStyles from "../page.module.css";
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

export default async function OnThisDayPage() {
  const day = await api.getOnThisDay();

  // Grouped by year so the page reads as a set of anniversaries rather than
  // one long list in which 2016 and 2024 sit next to each other unexplained.
  const byYear = new Map<number, typeof day.matches>();
  for (const match of day.matches) {
    if (!match.kickoff_at) continue;
    const year = new Date(match.kickoff_at).getFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), match]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Σαν σήμερα" />

      <p className={styles.date}>
        {day.day} {MONTHS[day.month - 1]}
      </p>

      {years.length === 0 ? (
        <Empty
          title="Χωρίς αγώνα"
          body="Δεν υπάρχει καταγεγραμμένος αγώνας για αυτή την ημερομηνία στο αρχείο."
        />
      ) : (
        years.map((year) => (
          <section key={year} className={styles.year}>
            <SectionHeader title={String(year)} />
            <ul className={styles.list}>
              {byYear.get(year)!.map((match) => {
                const margin = Math.abs(
                  (match.home_score ?? 0) - (match.away_score ?? 0),
                );
                return (
                  <li key={match.id}>
                    <Link href={`/agones/${match.id}`} className={styles.row}>
                      <span className={styles.teams}>
                        <span className={styles.team}>
                          {match.home_team.name}
                        </span>
                        <span className={styles.team}>
                          {match.away_team.name}
                        </span>
                      </span>
                      <span
                        className={`${styles.score} ${margin >= 5 ? styles.thrashing : ""}`}
                      >
                        {match.home_score}–{match.away_score}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <p className={styles.note}>
        Από 22.022 αγώνες σε 13 περιόδους. Οι μεγαλύτερες διαφορές έρχονται
        πρώτες.
      </p>
    </div>
  );
}
