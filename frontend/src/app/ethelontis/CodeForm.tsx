"use client";

import { useState } from "react";

import { Logo, Wordmark } from "@/components/Logo";
import { ApiError } from "@/lib/api";
import { volunteerApi, type Volunteer } from "@/lib/volunteerApi";
import { CodeInput } from "./CodeInput";
import styles from "./page.module.css";

/** Screen V1. The whole login: one code, no account.
 *
 *  The brand is drawn on the light canvas here rather than on navy, so ΠΑΜΕ
 *  takes green-600 and ΣΕΝΤΡΑ takes navy — the inverse of the header. green-400
 *  on white is 2.0:1 and would be unreadable.
 */
export function CodeForm({ onIn }: { onIn: (who: Volunteer) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const who = await volunteerApi.login(code.trim());
      if (who) onIn(who);
    } catch (problem) {
      setError(
        problem instanceof ApiError
          ? problem.message
          : "Δεν έγινε η σύνδεση. Δοκίμασε ξανά.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.login} onSubmit={submit}>
      <div className={styles.loginBrand}>
        <Logo size={40} />
        <Wordmark size={40} on="light" />
      </div>

      <h1 className={styles.loginTitle}>
        Ενημέρωσε live τον αγώνα της ομάδας σου
      </h1>
      <p className={styles.loginLead}>
        Βάλε τον κωδικό σωματείου που σου έδωσε η ένωση.
      </p>

      <CodeInput value={code} onChange={setCode} invalid={error !== null} />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={styles.primary} disabled={busy}>
        {busy ? "Σύνδεση…" : "Σύνδεση"}
      </button>

      <p className={styles.loginNote}>
        Δεν έχεις κωδικό; Ζήτησέ τον από την ένωση — δίνεται ανά σωματείο και
        ισχύει μόνο για τους αγώνες του.
      </p>
    </form>
  );
}
