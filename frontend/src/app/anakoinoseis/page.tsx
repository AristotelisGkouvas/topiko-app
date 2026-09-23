import type { Metadata } from "next";

import { LastUpdated } from "@/components/LastUpdated";
import { SearchBox } from "@/components/SearchBox";
import { Empty } from "@/components/States";
import { api } from "@/lib/api";
import { readParam, type SearchParams } from "@/lib/leagues";
import pageStyles from "../page.module.css";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ανακοινώσεις",
  description: "Οι ανακοινώσεις της ΕΠΣ Ηπείρου, δίπλα στα αποτελέσματα.",
};

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = readParam(params, "anazitisi")?.trim();

  const [items, meta] = await Promise.all([
    api.listAnnouncements({ q: query, limit: 40 }),
    api.getMeta(),
  ]);

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.titleBlock}>
        <h1>Ανακοινώσεις</h1>
        <LastUpdated
          timestamp={meta.last_scraped_at}
          sourceUrl={meta.source_url}
        />
      </div>

      <SearchBox
        placeholder="Αναζήτηση ανακοίνωσης…"
        label="Αναζήτηση ανακοίνωσης"
      />

      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.row}>
              <div className={styles.head}>
                <h2 className={styles.title}>{item.title}</h2>
                {item.published_at && (
                  <time className={styles.when} dateTime={item.published_at}>
                    {new Date(item.published_at).toLocaleString("el-GR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                )}
              </div>
              {item.body && <p className={styles.body}>{item.body}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          title={query ? "Κανένα αποτέλεσμα" : "Καμία ανακοίνωση"}
          body={
            query
              ? `Δεν βρέθηκε ανακοίνωση για «${query}».`
              : "Δεν έχει καταγραφεί ακόμη ανακοίνωση."
          }
        />
      )}

      <p className={styles.source}>
        Αντίγραφο από το epsip.gr. Η ένωση δεν δημοσιεύει feed ούτε ξεχωριστή
        διεύθυνση ανά ανακοίνωση — για το επίσημο κείμενο, δες την πηγή.
      </p>
    </div>
  );
}
