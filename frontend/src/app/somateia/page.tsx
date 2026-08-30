import type { Metadata } from "next";
import Link from "next/link";

import { Crest } from "@/components/Crest";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Σωματεία" };

export default async function ClubsPage() {
  const teams = await api.listTeams();

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Σωματεία</h1>
        <p className={styles.subtitle}>
          {teams.length} {teams.length === 1 ? "σωματείο" : "σωματεία"} στην ένωση.
        </p>
      </div>

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
          body="Δεν έχουν καταχωρηθεί σωματεία για αυτή την ένωση."
        />
      )}
    </div>
  );
}
