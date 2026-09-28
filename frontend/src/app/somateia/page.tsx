import type { Metadata } from "next";
import Link from "next/link";

import { ActivityStatus } from "@/components/ActivityStatus";
import { Crest } from "@/components/Crest";
import { SearchBox } from "@/components/SearchBox";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";
import { plural } from "@/lib/format";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Σωματεία",
  description: "Όλα τα σωματεία της ΕΠΣ Ηπείρου: έδρα, κατηγορία, πρόγραμμα, αποτελέσματα και θέση στη βαθμολογία.",
};

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = readParam(params, "anazitisi");
  const teams = await api.listTeams(query);
  const playing = teams.filter((t) => t.active !== false);
  const folded = teams.filter((t) => t.active === false);

  const grid = (list: Team[]) => (
    <div className={styles.grid}>
      {list.map((team) => (
        <Link
          key={team.id}
          href={`/somateia/${team.slug}`}
          className={
            team.active === false
              ? `${styles.card} ${styles.inactive}`
              : styles.card
          }
        >
          <Crest team={team} size="md" />
          <span className={styles.text}>
            <span className={styles.name}>{team.name}</span>
            <ActivityStatus active={team.active} />
            <span className={styles.meta}>
              {[team.city, team.home_field?.name].filter(Boolean).join(" · ")}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Σωματεία</h1>
        <p className={styles.subtitle}>
          {query
            ? `${teams.length} ${plural(teams.length, "σωματείο", "σωματεία")} για «${query}».`
            : `${playing.length} ${plural(playing.length, "σωματείο", "σωματεία")} σε πρωτάθλημα φέτος, ${teams.length} στο μητρώο της ένωσης.`}
        </p>
      </div>

      <SearchBox placeholder="Αναζήτηση σωματείου…" label="Αναζήτηση σωματείου" />

      {teams.length > 0 ? (
        <>
          {grid(playing)}
          {folded.length > 0 && (
            <>
              {/* Half the register has folded. They stay reachable — a club's
                  history is the only thing left of it — but after this
                  season's clubs rather than mixed in among them. */}
              <h2 className={styles.groupTitle}>
                Δεν συμμετέχουν φέτος ({folded.length})
              </h2>
              {grid(folded)}
            </>
          )}
        </>
      ) : (
        <Empty
          title="Κανένα σωματείο"
          body={
            query
              ? `Δεν βρέθηκε σωματείο για «${query}».`
              : "Δεν έχουν καταχωρηθεί σωματεία για αυτή την ένωση."
          }
        />
      )}
    </div>
  );
}
