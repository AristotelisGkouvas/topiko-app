"use client";

import { useState } from "react";
import useSWR from "swr";

import { ApiError, apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import type { components } from "@/lib/api-schema";
import type { League } from "@/lib/types";
import { noteAuthError } from "./session";
import styles from "./page.module.css";

type PlayerHit = components["schemas"]["PlayerSearchOut"];
type Candidate = { player: PlayerHit; reason: string };

/** "MVP": open the vote for one round of one division.
 *
 *  Search the register, add two to twelve players with a line on why, send.
 *  Sending again for the same round replaces the ballot (and its votes) —
 *  the API's rule, said here before the button is pressed.
 */
export function MvpEditor() {
  const { data: leagues } = useSWR<League[]>(apiUrl("/leagues"), jsonFetcher);
  const [league, setLeague] = useState("");
  const [matchday, setMatchday] = useState("");
  const [closes, setCloses] = useState("");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const chosenLeague = leagues?.find((l) => l.slug === (league || leagues[0]?.slug));
  const { data: hits } = useSWR<PlayerHit[]>(
    query.trim().length >= 2 ? apiUrl(`/players?q=${encodeURIComponent(query.trim())}&limit=10`) : null,
    jsonFetcher,
  );

  function add(player: PlayerHit) {
    if (candidates.some((c) => c.player.slug === player.slug) || candidates.length >= 12) return;
    setCandidates([...candidates, { player, reason: "" }]);
    setQuery("");
  }

  async function open() {
    const round = Number(matchday || chosenLeague?.current_matchday || 0);
    if (!chosenLeague || !round) {
      setMessage("Διάλεξε κατηγορία και αγωνιστική.");
      return;
    }
    if (candidates.length < 2) {
      setMessage("Χρειάζονται τουλάχιστον δύο υποψήφιοι.");
      return;
    }
    if (
      !window.confirm(
        `Άνοιγμα ψηφοφορίας για την ${round}η αγωνιστική (${chosenLeague.short_name ?? chosenLeague.name}) με ${candidates.length} υποψηφίους; Αν υπάρχει ήδη ψηφοφορία γι' αυτή την αγωνιστική, αντικαθίσταται μαζί με τις ψήφους της.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(apiUrl("/editor/mvp"), {
        method: "POST",
        credentials: "include",
        json: {
          league_slug: chosenLeague.slug,
          matchday: round,
          closes_at: closes ? new Date(closes).toISOString() : null,
          candidates: candidates.map((c) => ({
            player_slug: c.player.slug,
            team_slug: c.player.last_team?.slug ?? null,
            reason: c.reason.trim() || null,
          })),
        },
      });
      setCandidates([]);
      setMessage("Η ψηφοφορία άνοιξε. Φαίνεται στη σελίδα «Παίκτης αγωνιστικής» και στην αρχική.");
    } catch (err) {
      noteAuthError(err);
      setMessage(err instanceof ApiError ? err.message : "Απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.mvp}>
      <div className={styles.filters}>
        <select
          className={styles.select}
          value={league || chosenLeague?.slug || ""}
          onChange={(e) => setLeague(e.target.value)}
          aria-label="Κατηγορία"
        >
          {(leagues ?? []).map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.short_name ?? l.name}
            </option>
          ))}
        </select>
        <label className={styles.inlineLabel}>
          Αγωνιστική
          <input
            className={styles.small}
            inputMode="numeric"
            value={matchday}
            placeholder={String(chosenLeague?.current_matchday ?? "")}
            onChange={(e) => setMatchday(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </label>
        <label className={styles.inlineLabel}>
          Κλείνει
          <input
            className={styles.input}
            type="datetime-local"
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
          />
        </label>
      </div>

      <input
        className={styles.input}
        type="search"
        placeholder="Πρόσθεσε παίκτη — γράψε όνομα…"
        aria-label="Αναζήτηση παίκτη"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {hits && hits.length > 0 && (
        <ul className={styles.rows}>
          {hits.map((p) => (
            <li key={p.slug}>
              <button type="button" className={styles.pickPlayer} onClick={() => add(p)}>
                <strong>{p.name}</strong>
                {p.last_team ? ` · ${p.last_team.name}` : ""}
                {p.total_goals ? ` · ${p.total_goals} γκολ` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && hits?.length === 0 && (
        <p className={styles.who}>
          Κανένας παίκτης με αυτό το όνομα στο μητρώο. Η ψηφοφορία χρειάζεται
          παίκτες από το μητρώο της ένωσης.
        </p>
      )}

      {candidates.length > 0 && (
        <ol className={styles.rows}>
          {candidates.map((c, i) => (
            <li key={c.player.slug} className={styles.codeRow}>
              <span>
                <strong>{c.player.name}</strong>
                {c.player.last_team ? ` · ${c.player.last_team.name}` : ""}
              </span>
              <input
                className={styles.input}
                placeholder="Γιατί; (π.χ. 3 γκολ)"
                value={c.reason}
                onChange={(e) =>
                  setCandidates(candidates.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))
                }
                aria-label={`Αιτιολογία για ${c.player.name}`}
              />
              <button
                type="button"
                className={styles.logout}
                onClick={() => setCandidates(candidates.filter((_, j) => j !== i))}
              >
                Αφαίρεση
              </button>
            </li>
          ))}
        </ol>
      )}

      <button type="button" className={styles.save} disabled={busy} onClick={open}>
        {busy ? "…" : `Άνοιγμα ψηφοφορίας (${candidates.length}/12)`}
      </button>
      {message && (
        <p className={styles.who} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
