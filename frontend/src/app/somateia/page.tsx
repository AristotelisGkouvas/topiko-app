import type { Metadata } from "next";
import Link from "next/link";

import { Crest } from "@/components/Crest";
import { SearchBox } from "@/components/SearchBox";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Σωματεία" };

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = readParam(params, "anazitisi");
  const teams = await api.listTeams(query);

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Σωματεία</h1>
        <p className={styles.subtitle}>
          {query
            ? `${teams.length} ${plural(teams.length, "σωματείο", "σωματεία")} για «${query}».`
            : `${teams.length} ${plural(teams.length, "σωματείο", "σωματεία")} στην ένωση.`}
        </p>
      </div>

      <SearchBox placeholder="Αναζήτηση σωματείου…" label="Αναζήτηση σωματείου" />

      {teams.length > 0 ? (
        <div className={styles.grid}>
          {teams.map((team) => (
            <Link
              key={team.id}
              href={`/somateia/${team.slug}`}
              className={styles.card}
            >
              <Crest team={team} size="md" />
              <span className={styles.text}>
                <span className={styles.name}>{team.name}</span>
                <span className={styles.meta}>
                  {[team.city, team.home_field?.name]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Link>
          ))}
        </div>
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
