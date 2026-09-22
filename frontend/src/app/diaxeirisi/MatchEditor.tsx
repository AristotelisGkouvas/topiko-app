"use client";

import { useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { EditorError, editorApi } from "@/lib/editorApi";
import { formatDayDate, formatTime } from "@/lib/format";
import type { Match } from "@/lib/types";
import styles from "./page.module.css";

export function MatchEditor() {
  const [days, setDays] = useState(3);
  const { data, error, isLoading, mutate } = useSWR<Match[]>(
    ["editor:matches", days],
    () => editorApi.matches(days),
  );

  if (isLoading) return <p className={styles.loading}>Φόρτωση αγώνων…</p>;
  if (error) return <Empty title="Δεν φορτώθηκαν οι αγώνες" />;

  return (
    <>
      <div className={styles.filters}>
        <label className={styles.inlineLabel}>
          Παράθυρο
          <select
            className={styles.select}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>±1 μέρα</option>
            <option value={3}>±3 μέρες</option>
            <option value={7}>±7 μέρες</option>
            <option value={14}>±14 μέρες</option>
          </select>
        </label>
      </div>

      {data && data.length > 0 ? (
        <ul className={styles.rows}>
          {data.map((match) => (
            <MatchRow key={match.id} match={match} onSaved={() => mutate()} />
          ))}
        </ul>
      ) : (
        <Empty
          title="Κανένας αγώνας"
          body="Δεν υπάρχει αγώνας σε αυτό το παράθυρο. Δοκίμασε μεγαλύτερο."
        />
      )}
    </>
  );
}

/** A number field that keeps "cleared" distinct from "zero".
 *
 *  An empty box means "no result recorded" and 0 means "nil". Storing both as
 *  0 would turn every postponed fixture into a goalless draw in the table.
 */
function toScore(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function MatchRow({ match, onSaved }: { match: Match; onSaved: () => void }) {
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    home !== (match.home_score?.toString() ?? "") ||
    away !== (match.away_score?.toString() ?? "");

  async function save(confirmed: boolean) {
    setBusy(true);
    setError(null);
    try {
      await editorApi.saveMatch(match.id, {
        home_score: toScore(home),
        away_score: toScore(away),
        confirmed,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof EditorError ? err.message : "Απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={styles.row}>
      <div className={styles.when}>
        <span>{formatDayDate(match.kickoff_at)}</span>
        <span className={styles.time}>{formatTime(match.kickoff_at)}</span>
      </div>

      <div className={styles.teams}>
        <span>{match.home_team.name}</span>
        <span>{match.away_team.name}</span>
      </div>

      <div className={styles.scores}>
        <input
          className={styles.score}
          inputMode="numeric"
          value={home}
          onChange={(e) => {
            setHome(e.target.value.replace(/\D/g, "").slice(0, 2));
            setSaved(false);
          }}
          aria-label={`Γκολ ${match.home_team.name}`}
        />
        <input
          className={styles.score}
          inputMode="numeric"
          value={away}
          onChange={(e) => {
            setAway(e.target.value.replace(/\D/g, "").slice(0, 2));
            setSaved(false);
          }}
          aria-label={`Γκολ ${match.away_team.name}`}
        />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.save}
          disabled={busy || !dirty}
          onClick={() => save(false)}
          title="Καταχώρηση — ο scraper υποχωρεί για 48 ώρες"
        >
          {busy ? "…" : "Καταχώρηση"}
        </button>
        <button
          type="button"
          className={styles.confirm}
          disabled={busy}
          onClick={() => save(true)}
          title="Ελέγχθηκε με το φύλλο αγώνα"
        >
          ✓
        </button>
      </div>

      {match.data_source !== "scraper" && (
        <span className={styles.badge}>
          {match.data_source === "manual_live" ? "live" : "επιβεβαιωμένο"}
        </span>
      )}
      {saved && !dirty && <span className={styles.ok}>αποθηκεύτηκε</span>}
      {error && (
        <span className={styles.rowError} role="alert">
          {error}
        </span>
      )}
    </li>
  );
}
