"use client";

import { useState } from "react";

import { ApiError } from "@/lib/api";
import { editorApi } from "@/lib/editorApi";
import styles from "./page.module.css";

export function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className={styles.login}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await editorApi.login(email, password);
          onSignedIn();
        } catch (err) {
          setError(
            err instanceof ApiError ? err.message : "Κάτι πήγε στραβά.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className={styles.title}>Σύνδεση συντάκτη</h1>

      <label className={styles.label}>
        Email
        <input
          type="email"
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </label>

      <label className={styles.label}>
        Κωδικός
        <input
          type="password"
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      {/* role=alert so the failure is announced, not just shown: the field
          keeps focus and a sighted user sees it appear below the button. */}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={styles.submit} disabled={busy}>
        {busy ? "Σύνδεση…" : "Σύνδεση"}
      </button>

      <p className={styles.hint}>
        Δεν υπάρχει εγγραφή. Οι λογαριασμοί δημιουργούνται από διαχειριστή.
      </p>
    </form>
  );
}
