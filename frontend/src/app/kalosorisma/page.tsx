import type { Metadata } from "next";
import Link from "next/link";

import { Logo, Wordmark } from "@/components/Logo";
import { SearchBox } from "@/components/SearchBox";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import { ClubPicker, type PickableClub } from "./ClubPicker";
import { Finish } from "./Finish";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Καλώς όρισες",
  description: "Τρία βήματα για να στηθεί το ΠΑΜΕ ΣΕΝΤΡΑ στα μέτρα σου.",
};

const STEPS = [
  { n: 1, label: "Τι είναι" },
  { n: 2, label: "Το σωματείο σου" },
  { n: 3, label: "Ειδοποιήσεις" },
];

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const asked = Number(readParam(params, "vima"));
  const step = asked === 2 || asked === 3 ? asked : 1;
  const query = readParam(params, "anazitisi")?.trim() ?? "";

  // Only step two needs the register, and only then is it fetched.
  let teams: PickableClub[] = [];
  if (step === 2) {
    // The folded search when they type, the whole register when they have not
    // — 177 clubs is a scroll, but it is also every possible right answer.
    teams =
      query.length >= 2
        ? (await api.search(query)).teams
        : await api.listTeams();
  }

  return (
    <div className={styles.page}>
      <ol className={styles.steps} aria-label="Βήματα">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className={`${styles.step} ${s.n === step ? styles.stepOn : ""} ${
              s.n < step ? styles.stepDone : ""
            }`}
            aria-current={s.n === step ? "step" : undefined}
          >
            <span className={styles.stepDot}>{s.n < step ? "✓" : s.n}</span>
            <span className={styles.stepLabel}>{s.label}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className={styles.panel}>
          <div className={styles.brand}>
            <Logo size={64} />
            <Wordmark />
          </div>
          <p className={styles.lead}>
            Τα ερασιτεχνικά της Ηπείρου σε ένα μέρος: βαθμολογίες,
            αποτελέσματα, πρόγραμμα και γήπεδα — χωρίς λογαριασμό και χωρίς
            διαφημίσεις.
          </p>
          <ul className={styles.bullets}>
            <li>
              <strong>Ζωντανά σκορ</strong> την ώρα του αγώνα, με τη βαθμολογία
              να αλλάζει μαζί τους.
            </li>
            <li>
              <strong>Το σωματείο σου</strong> πρώτο στην αρχική, με το επόμενο
              παιχνίδι και το γήπεδο.
            </li>
            <li>
              <strong>Δουλεύει και χωρίς σήμα</strong> — ό,τι έχεις δει μένει
              διαθέσιμο στο γήπεδο.
            </li>
          </ul>
          <div className={styles.actions}>
            <Link href="/kalosorisma?vima=2" className={styles.primary}>
              Ξεκίνα
            </Link>
            <Link href="/" className={styles.secondary}>
              Όχι τώρα
            </Link>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className={styles.panel}>
          <h1 className={styles.heading}>Ποιον ακολουθείς;</h1>
          <p className={styles.lead}>
            Διάλεξε ένα σωματείο και θα εμφανίζεται πρώτο, παντού.
          </p>

          <SearchBox
            placeholder="Όνομα σωματείου…"
            label="Αναζήτηση σωματείου"
          />

          {teams.length === 0 ? (
            <Empty
              title="Κανένα σωματείο"
              body={`Δεν βρέθηκε σωματείο για «${query}».`}
            />
          ) : (
            <ClubPicker teams={teams} />
          )}

          <p className={styles.backLink}>
            <Link href="/kalosorisma">← Πίσω</Link>
          </p>
        </section>
      )}

      {step === 3 && (
        <section className={styles.panel}>
          <h1 className={styles.heading}>Να σου λέμε;</h1>
          <Finish />
          <p className={styles.backLink}>
            <Link href="/kalosorisma?vima=2">← Πίσω</Link>
          </p>
        </section>
      )}
    </div>
  );
}
