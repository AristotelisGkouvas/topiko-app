"use client";

import { useState } from "react";
import useSWR from "swr";

import { ApiError } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import { shrink } from "@/lib/shrink";
import { volunteerApi, type ClubSelf } from "@/lib/volunteerApi";
import styles from "./page.module.css";

/** "Η ομάδα μου": the club's logo, its colours, and the sponsors it wants
 *  shown. Logo and colours go on at once; a sponsor waits for the federation
 *  to approve it, and says so. Folded under the match sheet, which is what
 *  this page is for on a Sunday. */
export function ClubPage() {
  const { data, mutate } = useSWR<ClubSelf | null>("ethelontis:club", () => volunteerApi.club());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<ClubSelf | null>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (next) await mutate(next, { revalidate: false });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Δεν αποθηκεύτηκε. Δοκίμασε ξανά.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const logo = mediaUrl(data.team.logo_url);

  return (
    <details className={styles.clubPage}>
      <summary className={styles.clubSummary}>Η ομάδα μου: λογότυπο, χρώματα, χορηγοί</summary>

      <div className={styles.clubRow}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the club's own small upload
          <img src={logo} alt="" className={styles.clubLogo} />
        ) : (
          <span className={styles.clubLogo} aria-hidden="true" />
        )}
        <label className={styles.clubButton}>
          {logo ? "Αλλαγή λογότυπου" : "Ανέβασμα λογότυπου"}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await run(async () => volunteerApi.setLogo(await shrink(file, "logo")));
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <form
        className={styles.clubForm}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          await run(() =>
            volunteerApi.setColours(String(f.get("primary")) || null, String(f.get("secondary")) || null),
          );
        }}
      >
        <label>
          Κύριο χρώμα
          <input type="color" name="primary" defaultValue={data.team.primary_color ?? "#128c40"} />
        </label>
        <label>
          Δεύτερο χρώμα
          <input type="color" name="secondary" defaultValue={data.team.secondary_color ?? "#ffffff"} />
        </label>
        <button type="submit" className={styles.clubButton} disabled={busy}>
          Αποθήκευση χρωμάτων
        </button>
      </form>

      <h3 className={styles.clubHeading}>Χορηγοί</h3>
      {data.sponsors.length > 0 && (
        <ul className={styles.clubSponsors}>
          {data.sponsors.map((s) => (
            <li key={s.id}>
              {s.name}{" "}
              <span className={styles.small}>
                {s.pending_approval
                  ? "· σε αναμονή έγκρισης από την ένωση"
                  : s.is_active
                    ? "· εμφανίζεται"
                    : "· σε παύση"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className={styles.clubForm}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          const file = f.get("file");
          const ok = await run(async () =>
            volunteerApi.proposeSponsor(
              String(f.get("name") ?? ""),
              String(f.get("website") ?? ""),
              file instanceof File && file.size > 0 ? await shrink(file, "logo") : null,
            ),
          );
          if (ok) form.reset();
        }}
      >
        <label>
          Όνομα χορηγού
          <input name="name" required maxLength={120} />
        </label>
        <label>
          Ιστοσελίδα (προαιρετικό)
          <input name="website" maxLength={255} inputMode="url" />
        </label>
        <label>
          Λογότυπο (προαιρετικό)
          <input type="file" name="file" accept="image/*" />
        </label>
        <button type="submit" className={styles.clubButton} disabled={busy}>
          Πρόταση χορηγού
        </button>
      </form>
      <p className={styles.small}>
        Ο χορηγός εμφανίζεται στη σελίδα της ομάδας, στους αγώνες της και στις
        εικόνες της για το Facebook, μόλις τον εγκρίνει η ένωση.
      </p>
      {error && (
        <p className={styles.small} role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
