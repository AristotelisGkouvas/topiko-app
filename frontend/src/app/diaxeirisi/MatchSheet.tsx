"use client";

import { useState } from "react";
import useSWR from "swr";

import { EVENT_LABELS, type EventKind, type MatchFeed } from "@/components/MatchTicker";
import { Empty } from "@/components/States";
import { EditorError, editorApi } from "@/lib/editorApi";
import { formatTime } from "@/lib/format";
import type { Match } from "@/lib/types";
import styles from "./sheet.module.css";

/** Φύλλο αγώνα — the screen used standing up at the ground.
 *
 *  Everything here is sized for a thumb and one hand: a goal is two taps and
 *  no typing, because asking for the scorer in the moment is how the goal
 *  itself goes unrecorded. Names are filled in afterwards, from the match
 *  page, by somebody sitting down.
 */
export function MatchSheet() {
  const [chosen, setChosen] = useState<Match | null>(null);

  const { data: matches, isLoading } = useSWR<Match[]>(
    ["editor:sheet", 1],
    () => editorApi.matches(1),
  );

  if (chosen) {
    return <Sheet match={chosen} onBack={() => setChosen(null)} />;
  }

  if (isLoading) return <p className={styles.loading}>Φόρτωση…</p>;

  if (!matches?.length) {
    return (
      <Empty
        title="Κανένας αγώνας σήμερα"
        body="Το φύλλο αγώνα δείχνει τους αγώνες της ημέρας."
      />
    );
  }

  return (
    <ul className={styles.pick}>
      {matches.map((match) => (
        <li key={match.id}>
          <button
            type="button"
            className={styles.pickRow}
            onClick={() => setChosen(match)}
          >
            <span className={styles.pickTime}>
              {formatTime(match.kickoff_at)}
            </span>
            <span className={styles.pickTeams}>
              {match.home_team.name} — {match.away_team.name}
            </span>
            {match.is_live && <span className={styles.pickLive}>LIVE</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Sheet({ match, onBack }: { match: Match; onBack: () => void }) {
  const [feed, setFeed] = useState<MatchFeed | null>(null);
  const [minute, setMinute] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSWR<MatchFeed>(
    ["sheet:feed", match.id],
    () => editorApi.feed(match.id),
    {
      // Polled so two people logging the same match see each other's entries
      // rather than each building a private version of the afternoon.
      refreshInterval: 15_000,
      onSuccess: (data) => setFeed(data),
    },
  );

  async function send(kind: EventKind, teamId?: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = Number.parseInt(minute, 10);
      setFeed(
        await editorApi.addEvent(match.id, {
          kind,
          team_id: teamId,
          minute: Number.isInteger(parsed) ? parsed : undefined,
        }),
      );
    } catch (err) {
      setError(err instanceof EditorError ? err.message : "Απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const last = feed?.events.at(-1);
    if (!last || busy) return;
    setBusy(true);
    setError(null);
    try {
      setFeed(await editorApi.undoEvent(match.id, last.id));
    } catch (err) {
      setError(err instanceof EditorError ? err.message : "Απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  const home = match.home_team;
  const away = match.away_team;

  return (
    <div className={styles.sheet}>
      <button type="button" className={styles.back} onClick={onBack}>
        ← Άλλος αγώνας
      </button>

      <div className={styles.board}>
        <span className={styles.boardTeam}>{home.short_name ?? home.name}</span>
        <span className={styles.boardScore}>
          {feed?.home_score ?? 0}–{feed?.away_score ?? 0}
        </span>
        <span className={styles.boardTeam}>{away.short_name ?? away.name}</span>
      </div>

      <label className={styles.minuteField}>
        Λεπτό
        <input
          className={styles.minuteInput}
          inputMode="numeric"
          value={minute}
          onChange={(e) => setMinute(e.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder="—"
          aria-label="Λεπτό αγώνα"
        />
      </label>

      <div className={styles.goals}>
        <button
          type="button"
          className={styles.goal}
          disabled={busy}
          onClick={() => send("goal", home.id)}
        >
          +1 ΓΚΟΛ
          <span className={styles.goalTeam}>{home.short_name ?? home.name}</span>
        </button>
        <button
          type="button"
          className={styles.goal}
          disabled={busy}
          onClick={() => send("goal", away.id)}
        >
          +1 ΓΚΟΛ
          <span className={styles.goalTeam}>{away.short_name ?? away.name}</span>
        </button>
      </div>

      <div className={styles.grid}>
        <Small label="🟨 Κίτρινη" onClick={() => send("yellow", home.id)} side={home.short_name ?? home.name} busy={busy} />
        <Small label="🟨 Κίτρινη" onClick={() => send("yellow", away.id)} side={away.short_name ?? away.name} busy={busy} />
        <Small label="🟥 Κόκκινη" onClick={() => send("red", home.id)} side={home.short_name ?? home.name} busy={busy} />
        <Small label="🟥 Κόκκινη" onClick={() => send("red", away.id)} side={away.short_name ?? away.name} busy={busy} />
      </div>

      <div className={styles.markers}>
        <button type="button" className={styles.marker} disabled={busy} onClick={() => send("kickoff")}>
          ▶ Σέντρα
        </button>
        <button type="button" className={styles.marker} disabled={busy} onClick={() => send("halftime")}>
          ⏸ Ημίχρονο
        </button>
        <button type="button" className={styles.marker} disabled={busy} onClick={() => send("second_half")}>
          ▶ Β΄ μέρος
        </button>
        <button type="button" className={styles.marker} disabled={busy} onClick={() => send("fulltime")}>
          ⏹ Τελικό
        </button>
      </div>

      <button
        type="button"
        className={styles.undo}
        disabled={busy || !feed?.events.length}
        onClick={undo}
      >
        ↶ Αναίρεση τελευταίου
      </button>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {feed && feed.events.length > 0 && (
        <ol className={styles.log}>
          {[...feed.events].reverse().map((event) => (
            <li key={event.id} className={styles.logRow}>
              <span className={styles.logMinute}>
                {event.minute !== null ? `${event.minute}′` : "—"}
              </span>
              <span>
                {EVENT_LABELS[event.kind].glyph}{" "}
                {EVENT_LABELS[event.kind].label}
                {event.team ? ` — ${event.team.short_name ?? event.team.name}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Small({
  label,
  side,
  onClick,
  busy,
}: {
  label: string;
  side: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button type="button" className={styles.small} disabled={busy} onClick={onClick}>
      <span>{label}</span>
      <span className={styles.smallSide}>{side}</span>
    </button>
  );
}
