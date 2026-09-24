import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

import { Crest } from "@/components/Crest";
import { SearchBox } from "@/components/SearchBox";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Παίκτες" };

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = readParam(params, "anazitisi")?.trim() ?? "";

  // Two characters, matching the API's own floor: one letter against a
  // register of fifteen thousand returns a page of noise and a slow query.
  const results = query.length >= 2 ? await api.searchPlayers(query) : [];

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Παίκτες" />

      <SearchBox placeholder="Αναζήτηση παίκτη…" label="Αναζήτηση παίκτη" />

      {query.length < 2 ? (
        <Empty
          title="Γράψε ένα όνομα"
          body="Το μητρώο έχει πάνω από 14.000 παίκτες — η αναζήτηση ξεκινά από δύο γράμματα."
        />
      ) : results.length === 0 ? (
        <Empty
          title="Κανένα αποτέλεσμα"
          body={`Δεν βρέθηκε παίκτης για «${query}».`}
        />
      ) : (
        <ul className={styles.list}>
          {results.map((player) => (
            <li key={player.id}>
              <Link href={`/paiktes/${player.slug}`} className={styles.row}>
                {player.last_team && <Crest team={player.last_team} size="sm" />}
                <span className={styles.names}>
                  <span className={styles.name}>{player.name}</span>
                  <span className={styles.club}>
                    {player.last_team?.name ?? "—"}
                  </span>
                </span>
                <span className={styles.goals}>
                  {player.total_goals}
                  <span className={styles.goalsLabel}>γκολ</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {results.length > 0 && (
        <p className={styles.note}>
          Το ίδιο όνομα μπορεί να ανήκει σε περισσότερους από έναν παίκτες. Το
          σωματείο και τα γκολ είναι αυτά που τους ξεχωρίζουν.
        </p>
      )}
    </div>
  );
}
