"use client";

import useSWR from "swr";

import { Empty } from "@/components/States";
import { editorApi, type ScrapeRun } from "@/lib/editorApi";
import styles from "./page.module.css";

const STATUS: Record<ScrapeRun["status"], string> = {
  running: "Σε εξέλιξη",
  success: "Ολοκληρώθηκε",
  partial: "Με προειδοποιήσεις",
  failed: "Απέτυχε",
};

/** The scraper's recent runs.
 *
 *  "Why is the site still showing Saturday?" used to need a shell on the
 *  server. A failed run looks exactly like a federation that published
 *  nothing, and this is where the two are told apart.
 */
export function ScrapeRuns() {
  const { data, error, isLoading } = useSWR<ScrapeRun[]>("editor:runs", () =>
    editorApi.scrapeRuns(20),
  );

  if (isLoading) return <p className={styles.loading}>Φόρτωση…</p>;
  if (error) return <Empty title="Δεν φορτώθηκαν οι ενημερώσεις" />;
  if (!data?.length)
    return <Empty title="Καμία ενημέρωση ακόμη" body="Ο scraper δεν έχει τρέξει." />;

  return (
    <ul className={styles.rows}>
      {data.map((run) => (
        <li key={run.id} className={styles.auditRow}>
          <div className={styles.auditHead}>
            <span className={styles.auditAction}>
              {STATUS[run.status]}
              {run.status === "failed" || run.status === "partial" ? " ⚠" : ""}
            </span>
            <span className={styles.auditWho}>
              {new Date(run.started_at).toLocaleString("el-GR")}
            </span>
          </div>
          <p className={styles.auditWho}>
            {run.matches_updated} ενημερώσεις · {run.matches_created} νέοι αγώνες ·{" "}
            {run.matches_deferred} σεβάστηκαν χειροκίνητη διόρθωση · {run.http_requests}{" "}
            αιτήματα
          </p>
          {run.error && <p className={styles.warn}>{run.error}</p>}
          {run.warnings.length > 0 && (
            <details>
              <summary>{run.warnings.length} προειδοποιήσεις</summary>
              <ul className={styles.diff}>
                {run.warnings.map((w, i) => (
                  <li key={i}>{typeof w === "string" ? w : JSON.stringify(w)}</li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}
