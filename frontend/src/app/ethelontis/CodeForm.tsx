"use client";

import { useState } from "react";

import { VolunteerError, volunteerApi, type Volunteer } from "@/lib/volunteerApi";
import styles from "./page.module.css";

/** The whole login: one box, one code.
 *
 *  No email, no password, no account to forget. The card the federation hands
 *  out says ΠΙΝ-482719 and that is everything the representative has to know.
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
        problem instanceof VolunteerError
          ? problem.message
          : "Δεν έγινε η σύνδεση. Δοκίμασε ξανά.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.panel} onSubmit={submit}>
      <h1 className={styles.heading}>Κωδικός σωματείου</h1>
      <p className={styles.lead}>
        Γράψε τον κωδικό που σου έδωσε η ένωση για να δηλώνεις τους αγώνες του
        σωματείου σου.
      </p>

      <label className={styles.label} htmlFor="code">
        Κωδικός
      </label>
      <input
        id="code"
        className={styles.input}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ΠΙΝ-482719"
        // Uppercase and no autocorrect: the code is letters and digits, and a
        // keyboard that helpfully capitalises the first letter only, or turns
        // ΠΙΝ into Πιν, produces a code that is rejected for no visible reason.
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        required
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button type="submit" className={styles.primary} disabled={busy}>
        {busy ? "Σύνδεση…" : "Σύνδεση"}
      </button>

      <p className={styles.small}>
        Δεν έχεις κωδικό; Ζήτησέ τον από την ένωση — δίνεται ανά σωματείο.
      </p>
    </form>
  );
}
