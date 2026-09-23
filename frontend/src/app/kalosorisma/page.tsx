import type { Metadata } from "next";
import Link from "next/link";

import { SearchBox } from "@/components/SearchBox";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import { ClubPicker, type PickableClub } from "./ClubPicker";
import { Finish } from "./Finish";
import { Steps } from "./Steps";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Καλώς όρισες",
  description: "Τρία βήματα για να στηθεί το ΠΑΜΕ ΣΕΝΤΡΑ στα μέτρα σου.",
};

/** Screens O1–O3 of the design file.
 *
 *  No app chrome: no header, no tab bar. The welcome is the whole screen,
 *  because it is the one moment the site is asking rather than answering — and
 *  a tab bar under it is an invitation to leave before the question is done.
 */
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
      query.length >= 2 ? (await api.search(query)).teams : await api.listTeams();
  }

  if (step === 1) {
    return (
      <div className={styles.page}>
        {/* The hero is the mark itself, at 70px — the design spends the whole
            upper screen on it, which is the only place in the app that does. */}
        <div className={styles.hero}>
          <span className={styles.heroSmall}>ΠΑΜΕ</span>
          <span className={styles.heroBig}>ΣΕΝΤΡΑ</span>
          <span className={styles.rule} aria-hidden="true">
            <span className={styles.ruleLine} />
            <span className={styles.ruleDot} />
            <span className={styles.ruleLine} />
          </span>
          <p className={styles.heroText}>
            Αποτελέσματα, βαθμολογίες και live από κάθε γήπεδο της ΕΠΣ Ηπείρου.
          </p>
        </div>

        <div className={styles.footerPanel}>
          <Steps at={1} />
          <Link href="/kalosorisma?vima=2" className={styles.primary}>
            Ξεκίνα
          </Link>
          <Link href="/" className={styles.skip}>
            Όχι τώρα
          </Link>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className={styles.page}>
        <div className={styles.head}>
          <Steps at={2} />
          <h1 className={styles.heading}>Ποια ομάδα υποστηρίζεις;</h1>
          <SearchBox
            placeholder="Αναζήτηση σωματείου ή χωριού…"
            label="Αναζήτηση σωματείου"
          />
        </div>

        <div className={styles.body}>
          {teams.length === 0 ? (
            <Empty
              title="Κανένα σωματείο"
              body={`Δεν βρέθηκε σωματείο για «${query}».`}
            />
          ) : (
            <ClubPicker teams={teams} />
          )}
        </div>

        <p className={styles.back}>
          <Link href="/kalosorisma">‹ Πίσω</Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Steps at={3} />
        <Finish />
      </div>
      <p className={styles.back}>
        <Link href="/kalosorisma?vima=2">‹ Πίσω</Link>
      </p>
    </div>
  );
}
