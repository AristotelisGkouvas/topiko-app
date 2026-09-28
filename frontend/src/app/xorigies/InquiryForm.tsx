"use client";

import { useState } from "react";

import { ApiError, apiFetch, apiUrl } from "@/lib/api";
import styles from "./page.module.css";

type Kind = "platform" | "club" | "other";

/** Four fields and a choice. Labels above the fields, errors under them, and
 *  a hidden field no person fills in, to turn away bots without a captcha. */
export function InquiryForm() {
  const [kind, setKind] = useState<Kind>("platform");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <p className={styles.sent} role="status">
        Ευχαριστούμε. Θα σας καλέσουμε σύντομα.
      </p>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setState("sending");
        setError(null);
        try {
          await apiFetch(apiUrl("/sponsor-inquiries"), {
            method: "POST",
            json: {
              kind,
              name: String(data.get("name") ?? ""),
              business: String(data.get("business") ?? "") || null,
              contact: String(data.get("contact") ?? ""),
              club: kind === "club" ? String(data.get("club") ?? "") || null : null,
              message: String(data.get("message") ?? "") || null,
              website: String(data.get("website") ?? "") || null,
            },
          });
          setState("sent");
        } catch (err) {
          setState("idle");
          setError(
            err instanceof ApiError && err.status === 429
              ? "Πολλές αποστολές από αυτή τη σύνδεση. Δοκιμάστε ξανά σε λίγο."
              : "Δεν στάλθηκε. Ελέγξτε ότι συμπληρώσατε όνομα και τηλέφωνο ή email, και ξαναδοκιμάστε.",
          );
        }
      }}
    >
      <fieldset className={styles.kinds}>
        <legend className={styles.label}>Ενδιαφέρομαι για</legend>
        {(
          [
            ["platform", "Χορηγία του Πάμε Σέντρα"],
            ["club", "Χορηγούς για την ομάδα μου"],
            ["other", "Κάτι άλλο"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={styles.kind}>
            <input
              type="radio"
              name="kind"
              value={value}
              checked={kind === value}
              onChange={() => setKind(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>Όνομα</span>
        <input name="name" required minLength={2} maxLength={120} autoComplete="name" />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Επιχείρηση (προαιρετικό)</span>
        <input name="business" maxLength={160} autoComplete="organization" />
      </label>
      {kind === "club" && (
        <label className={styles.field}>
          <span className={styles.label}>Σωματείο</span>
          <input name="club" maxLength={160} />
        </label>
      )}
      <label className={styles.field}>
        <span className={styles.label}>Τηλέφωνο ή email</span>
        <input name="contact" required minLength={5} maxLength={160} autoComplete="tel" inputMode="text" />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Μήνυμα (προαιρετικό)</span>
        <textarea name="message" maxLength={2000} rows={3} />
      </label>
      {/* For bots: hidden from people and from screen readers. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className={styles.trap} />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={state === "sending"}>
        {state === "sending" ? "Αποστολή…" : "Αποστολή"}
      </button>
    </form>
  );
}
