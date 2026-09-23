"use client";

import { useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { EditorError, editorApi, type EditorUser } from "@/lib/editorApi";
import { AuditList } from "./AuditList";
import { LoginForm } from "./LoginForm";
import { MatchEditor } from "./MatchEditor";
import { MatchSheet } from "./MatchSheet";
import { VenueEditor } from "./VenueEditor";
import styles from "./page.module.css";

type Tab = "sheet" | "matches" | "venues" | "audit";

const TABS: { id: Tab; label: string }[] = [
  // First, and the default: on a Sunday this is the only screen that matters.
  { id: "sheet", label: "Φύλλο αγώνα" },
  { id: "matches", label: "Αγώνες" },
  { id: "venues", label: "Γήπεδα" },
  { id: "audit", label: "Ιστορικό" },
];

export function EditorDashboard() {
  const [tab, setTab] = useState<Tab>("sheet");

  // The session is a cookie this page cannot read, so whether anyone is logged
  // in is a question only the API can answer.
  const { data: user, error, isLoading, mutate } = useSWR<EditorUser>(
    "editor:me",
    () => editorApi.me(),
    { shouldRetryOnError: false, revalidateOnFocus: true },
  );

  if (isLoading) return <p className={styles.loading}>Έλεγχος σύνδεσης…</p>;

  if (error instanceof EditorError && error.status === 401) {
    return <LoginForm onSignedIn={() => mutate()} />;
  }
  if (error) {
    return (
      <Empty
        title="Το API δεν απαντά"
        body="Δοκίμασε ξανά σε λίγο· αν επιμένει, δες αν τρέχει ο server."
      />
    );
  }
  if (!user) return null;

  const grant = user.associations[0];

  return (
    <>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Διαχείριση</h1>
          <p className={styles.who}>
            {user.full_name ?? user.email}
            {grant ? ` · ${grant.name}` : ""}
            {user.role === "admin" ? " · διαχειριστής" : ""}
            {grant && !grant.can_edit_live && user.role !== "admin" ? (
              <span className={styles.warn}>
                {" "}
                · χωρίς δικαίωμα live διόρθωσης
              </span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className={styles.logout}
          onClick={async () => {
            await editorApi.logout();
            mutate(undefined, { revalidate: true });
          }}
        >
          Αποσύνδεση
        </button>
      </header>

      <nav className={styles.tabs} aria-label="Ενότητες διαχείρισης">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "sheet" && <MatchSheet />}
      {tab === "matches" && <MatchEditor />}
      {tab === "venues" && <VenueEditor />}
      {tab === "audit" && <AuditList />}
    </>
  );
}
