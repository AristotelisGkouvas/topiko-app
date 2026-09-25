"use client";

import { useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { ApiError, apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import { editorApi } from "@/lib/editorApi";
import { formatDayDate, formatTime, listName } from "@/lib/format";
import type { Field, League, Match } from "@/lib/types";
import { noteAuthError } from "./session";
import styles from "./page.module.css";
import { confirm } from "@/components/ConfirmDialog";

/** The weekend's matches, to type results into.
 *
 *  Searchable by club and filterable by division: with fifteen divisions a
 *  weekend is ninety rows, and the secretary is looking for one of them.
 */
export function MatchEditor() {
  const [days, setDays] = useState(3);
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");

  const params = new URLSearchParams({ days: String(days) });
  if (query.trim().length >= 2) params.set("q", query.trim());
  if (league) params.set("league", league);

  const { data, error, isLoading, mutate } = useSWR<Match[]>(
    ["editor:matches", params.toString()],
    () =>
      apiFetch<Match[]>(apiUrl(`/editor/matches?${params}`), {
        credentials: "include",
      }),
    { keepPreviousData: true },
  );
  const { data: leagues } = useSWR<League[]>(apiUrl("/leagues"), jsonFetcher);
  const { data: fields } = useSWR<Field[]>("editor:fields", () => editorApi.fields());

  return (
    <>
      <div className={styles.filters}>
        <input
          className={styles.input}
          type="search"
          placeholder="Αναζήτηση ομάδας…"
          aria-label="Αναζήτηση ομάδας"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {leagues && leagues.length > 1 && (
          <select
            className={styles.select}
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            aria-label="Κατηγορία"
          >
            <option value="">Όλες οι κατηγορίες</option>
            {leagues.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.short_name ?? l.name}
              </option>
            ))}
          </select>
        )}
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
        {data && (
          <span className={styles.inlineLabel} aria-live="polite">
            {data.length} {data.length === 1 ? "αγώνας" : "αγώνες"}
          </span>
        )}
      </div>

      {isLoading && !data ? (
        <p className={styles.loading}>Φόρτωση αγώνων…</p>
      ) : error ? (
        <Empty title="Δεν φορτώθηκαν οι αγώνες" />
      ) : data && data.length > 0 ? (
        <ul className={styles.rows}>
          {data.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              fields={fields ?? []}
              onSaved={() => mutate()}
            />
          ))}
        </ul>
      ) : (
        <Empty
          title="Κανένας αγώνας"
          body={
            query || league
              ? "Κανένας αγώνας με αυτά τα φίλτρα σε αυτό το παράθυρο."
              : "Δεν υπάρχει αγώνας σε αυτό το παράθυρο. Δοκίμασε μεγαλύτερο."
          }
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

/** ISO → the "YYYY-MM-DDTHH:mm" a datetime-local input wants, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MatchRow({
  match,
  fields,
  onSaved,
}: {
  match: Match;
  fields: Field[];
  onSaved: () => void;
}) {
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [moving, setMoving] = useState(false);
  const [when, setWhen] = useState(toLocalInput(match.kickoff_at));
  const [where, setWhere] = useState(match.field?.id?.toString() ?? "");

  const dirty =
    home !== (match.home_score?.toString() ?? "") ||
    away !== (match.away_score?.toString() ?? "");
  const label = `${listName(match.home_team)} – ${listName(match.away_team)}`;

  async function run(edit: Parameters<typeof editorApi.saveMatch>[1]) {
    setBusy(true);
    setError(null);
    try {
      await editorApi.saveMatch(match.id, edit);
      setSaved(true);
      onSaved();
      return true;
    } catch (err) {
      noteAuthError(err);
      setError(err instanceof ApiError ? err.message : "Απέτυχε.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(confirmed: boolean) {
    if (
      confirmed &&
      !(await confirm(`${label}: ${home || "–"}-${away || "–"}`, {
        detail: "Επιβεβαιώνεις ότι το σκορ ελέγχθηκε με το φύλλο αγώνα;",
        confirmLabel: "Επιβεβαίωση",
      }))
    ) {
      return;
    }
    return run({ home_score: toScore(home), away_score: toScore(away), confirmed });
  }

  async function reschedule() {
    if (!when) {
      setError("Διάλεξε νέα ημερομηνία και ώρα.");
      return;
    }
    const ok = await run({
      kickoff_at: new Date(when).toISOString(),
      ...(where ? { field_id: Number(where) } : {}),
      // A postponed match that has a new date is simply scheduled again.
      ...(match.status === "postponed" ? { status: "scheduled" as const } : {}),
    });
    if (ok) setMoving(false);
  }

  return (
    <li>
      {/* A form, so Enter in a score box saves it — the way every other form
          on the web behaves, and what the secretary's fingers expect. */}
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !busy) void save(false);
        }}
      >
        <div className={styles.when}>
          <span>{formatDayDate(match.kickoff_at)}</span>
          <span className={styles.time}>{formatTime(match.kickoff_at)}</span>
        </div>

        <div className={styles.teams}>
          <span>{match.home_team.name}</span>
          <span>{match.away_team.name}</span>
          {match.field && <span className={styles.venue}>{match.field.name}</span>}
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
            type="submit"
            className={styles.save}
            disabled={busy || !dirty}
            title="Καταχώρηση — ο scraper υποχωρεί για 48 ώρες"
          >
            {busy ? "…" : "Καταχώρηση"}
          </button>
          <button
            type="button"
            className={styles.confirm}
            disabled={busy || home === "" || away === ""}
            onClick={() => save(true)}
            title="Ελέγχθηκε με το φύλλο αγώνα"
            aria-label={`Επιβεβαίωση σκορ ${label} με το φύλλο αγώνα`}
          >
            ✓
          </button>
          <button
            type="button"
            className={styles.save}
            disabled={busy}
            onClick={() => setMoving((m) => !m)}
            aria-expanded={moving}
          >
            Μετάθεση
          </button>
        </div>

        {moving && (
          <div className={styles.move}>
            <label className={styles.inlineLabel}>
              Νέα ημερομηνία
              <input
                className={styles.input}
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
            <label className={styles.inlineLabel}>
              Γήπεδο
              <select
                className={styles.select}
                value={where}
                onChange={(e) => setWhere(e.target.value)}
              >
                <option value="">— ίδιο —</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.save}
              disabled={busy}
              onClick={reschedule}
            >
              Αποθήκευση μετάθεσης
            </button>
          </div>
        )}

        {match.data_source !== "scraper" && (
          <span className={styles.badge}>
            {match.data_source === "manual_live"
              ? "χειροκίνητο · χωρίς έλεγχο"
              : "ελέγχθηκε με το φύλλο"}
          </span>
        )}
        {saved && !dirty && <span className={styles.ok}>αποθηκεύτηκε</span>}
        {error && (
          <span className={styles.rowError} role="alert">
            {error}
          </span>
        )}
      </form>
    </li>
  );
}
