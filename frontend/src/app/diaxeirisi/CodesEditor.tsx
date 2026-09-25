"use client";

import { useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { ApiError, apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import type { components } from "@/lib/api-schema";
import { formatRelative } from "@/lib/format";
import type { Team } from "@/lib/types";
import { noteAuthError } from "./session";
import styles from "./page.module.css";

type ClubCode = components["schemas"]["ClubCodeOut"];
type IssuedCode = components["schemas"]["IssuedCodeOut"];

const editor = (path: string) => apiUrl(`/editor${path}`);

/** "Σωματεία": the volunteer codes, issued and withdrawn from here.
 *
 *  So that on a Sunday when a club president rings to say the paper is lost,
 *  the secretary can issue a new one in a minute instead of phoning the
 *  developer. A new code replaces the club's old one; the plaintext is shown
 *  once, because it is stored hashed and cannot be read back.
 */
export function CodesEditor() {
  const { data: codes, error, isLoading, mutate } = useSWR<ClubCode[]>(
    "editor:club-codes",
    () => apiFetch<ClubCode[]>(editor("/club-codes"), { credentials: "include" }),
  );
  const { data: teams } = useSWR<Team[]>(apiUrl("/teams"), jsonFetcher);
  const [team, setTeam] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function issue() {
    if (!team) {
      setMessage("Διάλεξε σωματείο.");
      return;
    }
    const existing = codes?.find((c) => c.team_slug === team && c.is_active);
    if (
      existing &&
      !window.confirm(
        `Το ${existing.team_name} έχει ήδη ενεργό κωδικό. Ο νέος θα ακυρώσει τον παλιό. Συνέχεια;`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const code = await apiFetch<IssuedCode>(editor("/club-codes"), {
        method: "POST",
        credentials: "include",
        json: { team_slug: team, label: label.trim() || null },
      });
      setIssued(code);
      setLabel("");
      await mutate();
    } catch (err) {
      noteAuthError(err);
      setMessage(err instanceof ApiError ? err.message : "Απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(code: ClubCode) {
    if (!window.confirm(`Ακύρωση του κωδικού ${code.prefix}-… για ${code.team_name};`)) return;
    try {
      await apiFetch<void>(editor(`/club-codes/${code.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      await mutate();
    } catch (err) {
      noteAuthError(err);
      setMessage(err instanceof ApiError ? err.message : "Απέτυχε.");
    }
  }

  if (isLoading) return <p className={styles.loading}>Φόρτωση κωδικών…</p>;
  if (error) return <Empty title="Δεν φορτώθηκαν οι κωδικοί" />;

  const active = (codes ?? []).filter((c) => c.is_active);

  return (
    <>
      <div className={styles.filters}>
        <select
          className={styles.select}
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          aria-label="Σωματείο"
        >
          <option value="">Σωματείο…</option>
          {(teams ?? []).map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          placeholder="Σε ποιον δίνεται (π.χ. Γ. Παπαδόπουλος, έφορος)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Σε ποιον δίνεται ο κωδικός"
        />
        <button type="button" className={styles.save} disabled={busy} onClick={issue}>
          {busy ? "…" : "Νέος κωδικός"}
        </button>
      </div>

      {issued && (
        <div className={styles.issued} role="status">
          <p>
            Κωδικός για <strong>{issued.team_name}</strong>:
          </p>
          <p className={styles.issuedCode}>{issued.code}</p>
          <p>
            Γράψ&apos; τον τώρα στο χαρτί — δεν θα ξαναεμφανιστεί. Ο εθελοντής
            τον πληκτρολογεί στη σελίδα «Δήλωση αγώνα», με ή χωρίς τόνους.
          </p>
          <button type="button" className={styles.save} onClick={() => setIssued(null)}>
            Τον έγραψα
          </button>
        </div>
      )}

      {message && (
        <p className={styles.rowError} role="alert">
          {message}
        </p>
      )}

      {active.length === 0 ? (
        <Empty title="Κανένας ενεργός κωδικός" body="Διάλεξε σωματείο και πάτα «Νέος κωδικός»." />
      ) : (
        <ul className={styles.rows}>
          {active.map((code) => (
            <li key={code.id} className={styles.venueRow}>
              <div className={styles.codeRow}>
                <span>
                  <strong>{code.team_name}</strong> · {code.prefix}-••••••
                  {code.label ? ` · ${code.label}` : ""}
                </span>
                <span className={styles.who}>
                  {code.last_used_at
                    ? `τελευταία χρήση ${formatRelative(code.last_used_at)}`
                    : "δεν έχει χρησιμοποιηθεί"}
                </span>
                <button type="button" className={styles.logout} onClick={() => revoke(code)}>
                  Ακύρωση
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
