"use client";

import useSWR from "swr";

import { Empty } from "@/components/States";
import { editorApi, type AuditEntry } from "@/lib/editorApi";
import styles from "./page.module.css";

const ACTIONS: Record<string, string> = {
  "match.edit": "Αγώνας",
  "field.edit": "Γήπεδο",
};

export function AuditList() {
  const { data, error, isLoading } = useSWR<AuditEntry[]>("editor:audit", () =>
    editorApi.audit(40),
  );

  if (isLoading) return <p className={styles.loading}>Φόρτωση ιστορικού…</p>;
  if (error) return <Empty title="Δεν φορτώθηκε το ιστορικό" />;
  if (!data?.length)
    return (
      <Empty title="Καμία αλλαγή" body="Δεν έχει γίνει ακόμη καμία διόρθωση." />
    );

  return (
    <ul className={styles.rows}>
      {data.map((entry) => (
        <li key={entry.id} className={styles.auditRow}>
          <div className={styles.auditHead}>
            <span className={styles.auditAction}>
              {ACTIONS[entry.action] ?? entry.action}
              {entry.entity_id ? ` #${entry.entity_id}` : ""}
            </span>
            <span className={styles.auditWho}>
              {entry.user_email ?? "άγνωστος"} ·{" "}
              {new Date(entry.created_at).toLocaleString("el-GR")}
            </span>
          </div>
          <Diff before={entry.old_value} after={entry.new_value} />
        </li>
      ))}
    </ul>
  );
}

/** Only the fields that moved, which is all the log stores. */
function Diff({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = Object.keys(after ?? {});
  if (keys.length === 0) return null;

  return (
    <ul className={styles.diff}>
      {keys.map((key) => (
        <li key={key}>
          <span className={styles.diffKey}>{key}</span>
          <span className={styles.diffFrom}>{show(before?.[key])}</span>
          <span aria-hidden="true">→</span>
          <span className={styles.diffTo}>{show(after?.[key])}</span>
        </li>
      ))}
    </ul>
  );
}

const show = (value: unknown) =>
  value === null || value === undefined ? "—" : String(value);
