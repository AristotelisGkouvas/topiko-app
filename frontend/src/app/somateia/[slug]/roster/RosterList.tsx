"use client";

import Link from "next/link";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { apiUrl, jsonFetcher } from "@/lib/api";
import type { components } from "@/lib/api-schema";
import styles from "./page.module.css";

type Row = components["schemas"]["RosterRowOut"];

export function RosterList({ slug }: { slug: string }) {
  const { data, error, isLoading } = useSWR<Row[]>(apiUrl(`/teams/${slug}/roster`), jsonFetcher);

  if (isLoading) return <p className={styles.note}>Φόρτωση…</p>;
  if (error || !data) return <Empty title="Δεν φορτώθηκε το ρόστερ" />;
  if (data.length === 0) {
    return (
      <Empty
        title="Χωρίς ρόστερ ακόμη"
        body="Το ρόστερ βγαίνει από τις λίστες που δημοσιεύει η ένωση· για αυτό το σωματείο δεν υπάρχει ακόμη καμία φέτος."
      />
    );
  }

  const banned = data.filter((r) => r.banned_matches);

  return (
    <div className={styles.page}>
      {banned.length > 0 && (
        <p className={styles.alert}>
          Πιθανώς εκτός την Κυριακή:{" "}
          {banned.map((r) => r.player.name).join(", ")}
        </p>
      )}
      <ul className={styles.list}>
        {data.map((row) => (
          <li key={row.player.id} className={styles.row}>
            <Link href={`/paiktes/${row.player.slug}`} className={styles.name}>
              {row.player.name}
            </Link>
            {row.banned_matches ? (
              <span className={styles.ban}>
                τιμωρία {row.banned_matches} αγ. (από {row.banned_after_matchday}η)
              </span>
            ) : null}
            <span className={styles.stats}>
              {row.goals} γκολ
              {row.yellow_cards ? ` · ${row.yellow_cards} κίτρ.` : ""}
              {row.red_cards ? ` · ${row.red_cards} κόκ.` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Όσοι έχουν εμφανιστεί φέτος στις λίστες της ένωσης — όχι επίσημη
        σύνθεση. Η τιμωρία υπολογίζεται από την αγωνιστική που επιβλήθηκε· η
        επίσημη λίστα είναι στις <Link href={`/poines?somateio=${slug}`}>Ποινές</Link>.
      </p>
    </div>
  );
}
