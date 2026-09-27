"use client";

import { useState } from "react";
import useSWR from "swr";

import { CopyText } from "@/components/CopyText";
import { Empty } from "@/components/States";
import { ApiError, apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import type { components } from "@/lib/api-schema";
import { formatRelative } from "@/lib/format";
import type { Team } from "@/lib/types";
import { noteAuthError } from "./session";
import styles from "./page.module.css";
import { confirm } from "@/components/ConfirmDialog";

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
/** `canIssue`: a code gives its holder the right to log live scores, so only
 *  those who hold that right themselves may hand one out or withdraw it. */
export function CodesEditor({ canIssue }: { canIssue: boolean }) {
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
      !(await confirm(`Το ${existing.team_name} έχει ήδη ενεργό κωδικό.`, {
        detail: "Ο νέος θα ακυρώσει τον παλιό.",
        confirmLabel: "Νέος κωδικός",
      }))
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
    if (
      !(await confirm(`Ακύρωση του κωδικού ${code.prefix}-… για ${code.team_name};`, {
        confirmLabel: "Ακύρωση κωδικού",
        danger: true,
      }))
    )
      return;
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
      {!canIssue && (
        <p className={styles.muted}>
          Κωδικούς εκδίδουν μόνο όσοι έχουν δικαίωμα live καταχώρισης. Ζήτησέ το από τον διαχειριστή.
        </p>
      )}
      {canIssue && (
      <div className={`${styles.filters} ${styles.codeForm}`}>
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
          placeholder="Σε ποιον (π.χ. Γ. Παπαδόπουλος)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Σε ποιον δίνεται ο κωδικός"
        />
        <button type="button" className={styles.save} disabled={busy} onClick={issue}>
          {busy ? "…" : "Νέος κωδικός"}
        </button>
      </div>
      )}

      {issued && (
        <div className={styles.issued} role="status">
          <p>
            Κωδικός για <strong>{issued.team_name}</strong>:
          </p>
          <p className={styles.issuedCode}>{issued.code}</p>
          <p>
            Δεν θα ξαναεμφανιστεί. Στείλε στον εθελοντή το μήνυμα — έχει μέσα
            τον κωδικό, το link και τι να πατήσει.
          </p>
          {/* Codes travel by Viber, not on paper: a ready message with the
              link beats reading eleven characters down a phone line. */}
          <div className={styles.issuedActions}>
            <CopyText
              label="Αντιγραφή μηνύματος"
              text={`Κωδικός για live από το γήπεδο (${issued.team_name}): ${issued.code}
Άνοιξε ${window.location.origin}/ethelontis και γράψ' τον εκεί. Στους αγώνες μας πάτα «+1 ΓΚΟΛ» σε κάθε γκολ και «Τελικό» στο σφύριγμα.`}
            />
            <CopyText text={issued.code} label="Αντιγραφή κωδικού" />
          </div>
          <button type="button" className={styles.save} onClick={() => setIssued(null)}>
            Εντάξει
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
                {canIssue && (
                <button type="button" className={styles.logout} onClick={() => revoke(code)}>
                  Ακύρωση
                </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
