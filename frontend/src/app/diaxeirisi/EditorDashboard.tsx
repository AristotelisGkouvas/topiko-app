"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { ApiError } from "@/lib/api";
import { editorApi, type EditorUser } from "@/lib/editorApi";
import { AuditList } from "./AuditList";
import { CodesEditor } from "./CodesEditor";
import { MvpEditor } from "./MvpEditor";
import { LoginForm } from "./LoginForm";
import { MatchEditor } from "./MatchEditor";
import { ScrapeRuns } from "./ScrapeRuns";
import { MatchSheet } from "@/components/MatchSheet";
import { VenueEditor } from "./VenueEditor";
import { SESSION_LOST } from "./session";
import styles from "./page.module.css";

type Tab = "sheet" | "matches" | "codes" | "mvp" | "venues" | "audit" | "runs";

const TABS: { id: Tab; label: string }[] = [
  // First, and the default: on a Sunday this is the only screen that matters.
  { id: "sheet", label: "Φύλλο αγώνα" },
  { id: "matches", label: "Αγώνες" },
  { id: "codes", label: "Σωματεία" },
  { id: "mvp", label: "MVP" },
  { id: "venues", label: "Γήπεδα" },
  { id: "audit", label: "Ιστορικό" },
  { id: "runs", label: "Ενημερώσεις" },
];

export function EditorDashboard() {
  const [tab, setTab] = useState<Tab>("sheet");
  const [lostOnSave, setLostOnSave] = useState(false);

  useEffect(() => {
    const lost = () => setLostOnSave(true);
    window.addEventListener(SESSION_LOST, lost);
    return () => window.removeEventListener(SESSION_LOST, lost);
  }, []);

  // The session is a cookie this page cannot read, so whether anyone is logged
  // in is a question only the API can answer.
  const { data: user, error, isLoading, mutate } = useSWR<EditorUser>(
    "editor:me",
    () => editorApi.me(),
    { shouldRetryOnError: false, revalidateOnFocus: true },
  );

  if (isLoading) return <p className={styles.loading}>Έλεγχος σύνδεσης…</p>;

  const expired = error instanceof ApiError && error.status === 401;
  // Signed out before anything was shown: the plain login form. Signed out
  // *while working* — a 401 on a save, or on the focus recheck with the user
  // still in hand — keeps the dashboard mounted below a login banner.
  if (expired && !user) {
    return <LoginForm onSignedIn={() => mutate()} />;
  }
  const sessionLost = lostOnSave || expired;
  if (error && !expired) {
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
            // One click away from the tabs, on a Sunday, with scores typed.
            if (!window.confirm("Αποσύνδεση από τη διαχείριση;")) return;
            await editorApi.logout();
            mutate(undefined, { revalidate: true });
          }}
        >
          Αποσύνδεση
        </button>
      </header>

      {sessionLost && (
        <section className={styles.relogin} role="alert">
          <p>
            Η σύνδεση έληξε. Συνδέσου ξανά — ό,τι έχεις γράψει παρακάτω μένει
            στη θέση του· μετά πάτα ξανά Καταχώρηση.
          </p>
          <LoginForm
            onSignedIn={() => {
              setLostOnSave(false);
              mutate();
            }}
          />
        </section>
      )}

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
      {tab === "codes" && <CodesEditor />}
      {tab === "mvp" && <MvpEditor />}
      {tab === "venues" && <VenueEditor />}
      {tab === "audit" && <AuditList />}
      {tab === "runs" && <ScrapeRuns />}
    </>
  );
}
