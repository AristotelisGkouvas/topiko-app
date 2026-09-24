"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { EVENT_LABELS, type EventKind, type MatchFeed } from "@/components/MatchTicker";
import { GoalSheet, type GoalChoice, type RosterPlayer } from "@/components/GoalSheet";
import { Empty } from "@/components/States";
import { EditorError, editorApi } from "@/lib/editorApi";
import {
  enqueue,
  flush,
  newClientId,
  useOnline,
  useOutboxSize,
} from "@/lib/outbox";
import { formatTime } from "@/lib/format";
import type { Match } from "@/lib/types";
import styles from "./MatchSheet.module.css";

/** How long an entry can be taken back.
 *
 *  A minute, as the handoff asks. Long enough to catch the tap that went to
 *  the wrong club, short enough that the log stops being editable while the
 *  match is still running — an undo an hour later is a correction, and
 *  corrections belong to the federation's own editors.
 */
const UNDO_WINDOW_MS = 60_000;

function undoable(event: { created_at: string }): boolean {
  return Date.now() - new Date(event.created_at).getTime() < UNDO_WINDOW_MS;
}

/** The match minute, counted from the kickoff entry.
 *
 *  Nobody standing at a village ground is going to type a number before every
 *  goal. The log already knows when the whistle went, so the clock is derived
 *  from it — and stops at half time, because the interval is not football.
 *
 *  Returns null until there is a kickoff to count from. A clock that starts at
 *  zero the moment the screen opens is worse than no clock: it looks right.
 */
function useMatchClock(feed: MatchFeed | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Ticked rather than read during render, which would be impure and would
    // disagree between two renders of the same data.
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!feed) return null;

  const kickoff = feed.events.find((e) => e.kind === "kickoff");
  if (!kickoff) return null;

  const stopped = feed.events.some(
    (e) => e.kind === "halftime" || e.kind === "fulltime",
  );
  const last = feed.events.at(-1);
  if (stopped && last) {
    // Frozen at whatever the last entry said, so the number on screen matches
    // the one in the log rather than drifting through the interval.
    return last.minute ?? null;
  }

  const elapsed = (now - new Date(kickoff.created_at).getTime()) / 60_000;
  return Math.max(1, Math.round(elapsed));
}

/** Where the sheet gets its data and where it sends it.
 *
 *  The same screen serves an editor with an account and a club with a code.
 *  They differ only in which endpoints answer and which queue the events are
 *  tagged for, so that difference is one object passed in rather than a second
 *  copy of the screen that would drift from this one by the first change.
 */
export interface SheetBackend {
  key: string;
  matches: () => Promise<Match[]>;
  feed: (matchId: number) => Promise<MatchFeed>;
  undo: (matchId: number, eventId: number) => Promise<MatchFeed>;
  /** Which endpoint a queued event is eventually posted to. */
  via: "editor" | "ethelontis";
  /** The club's own players, for the scorer sheet. Absent for the editor's
   *  dashboard, which covers every club and has no single squad to offer. */
  roster?: () => Promise<RosterPlayer[]>;
  empty: { title: string; body: string };
}

/** The dashboard's own: today's matches, across the whole federation. */
export const EDITOR_SHEET: SheetBackend = {
  key: "editor:sheet",
  matches: () => editorApi.matches(1),
  feed: (matchId) => editorApi.feed(matchId),
  undo: (matchId, eventId) => editorApi.undoEvent(matchId, eventId),
  via: "editor",
  empty: {
    title: "Κανένας αγώνας σήμερα",
    body: "Το φύλλο αγώνα δείχνει τους αγώνες της ημέρας.",
  },
};

/** Φύλλο αγώνα — the screen used standing up at the ground.
 *
 *  Everything here is sized for a thumb and one hand: a goal is two taps and
 *  no typing, because asking for the scorer in the moment is how the goal
 *  itself goes unrecorded. Names are filled in afterwards, from the match
 *  page, by somebody sitting down.
 */
export function MatchSheet({
  backend = EDITOR_SHEET,
}: {
  backend?: SheetBackend;
}) {
  const [chosen, setChosen] = useState<Match | null>(null);

  const { data: matches, isLoading } = useSWR<Match[]>(
    [backend.key, 1],
    () => backend.matches(),
  );

  if (chosen) {
    return (
      <Sheet
        match={chosen}
        backend={backend}
        onBack={() => setChosen(null)}
      />
    );
  }

  if (isLoading) return <p className={styles.loading}>Φόρτωση…</p>;

  if (!matches?.length) {
    return <Empty title={backend.empty.title} body={backend.empty.body} />;
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

function Sheet({
  match,
  backend,
  onBack,
}: {
  match: Match;
  backend: SheetBackend;
  onBack: () => void;
}) {
  const [feed, setFeed] = useState<MatchFeed | null>(null);
  const [minute, setMinute] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //: Which side's goal is being named, or null when the sheet is closed.
  const [scoring, setScoring] = useState<Match["home_team"] | null>(null);
  const queued = useOutboxSize();
  const online = useOnline();
  const clock = useMatchClock(feed);

  // Only the volunteer's own backend has a roster; the editor's dashboard
  // covers every club in the federation and has no single squad to offer.
  const { data: roster, isLoading: rosterLoading } = useSWR<RosterPlayer[]>(
    backend.roster ? [`${backend.key}:roster`] : null,
    () => backend.roster!(),
  );

  useEffect(() => {
    // Subscribes to two external systems and does nothing else: the queue
    // reports its own size, so nothing here sets state.
    const retry = async () => {
      const result = await flush();
      if (result.sent > 0) {
        const fresh = await editorApi.feed(match.id).catch(() => null);
        if (fresh) setFeed(fresh);
      }
    };
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(retry, 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [match.id]);

  useSWR<MatchFeed>(
    [`${backend.key}:feed`, match.id],
    () => backend.feed(match.id),
    {
      // Polled so two people logging the same match see each other's entries
      // rather than each building a private version of the afternoon.
      refreshInterval: 15_000,
      onSuccess: (data) => setFeed(data),
    },
  );

  async function send(
    kind: EventKind,
    teamId?: number,
    extra?: { playerName?: string | null; note?: string | null },
  ) {
    if (busy) return;
    setBusy(true);
    setError(null);
    // The typed minute wins over the clock: somebody correcting an entry from
    // five minutes ago is telling us something the clock cannot know.
    const parsed = Number.parseInt(minute, 10);
    const at = Number.isInteger(parsed) ? parsed : (clock ?? undefined);

    // Written down before it is sent. If the phone is behind the goal with no
    // reception, the afternoon is still recorded — which is the whole point.
    enqueue({
      client_id: newClientId(),
      match_id: match.id,
      kind,
      team_id: teamId,
      minute: at,
      player_name: extra?.playerName ?? undefined,
      note: extra?.note ?? undefined,
      // Tagged now, not at flush time: the queue can outlive this session.
      via: backend.via,
    });

    try {
      const result = await flush();
      if (result.blocked) setError(result.blocked);
      if (result.sent > 0) setFeed(await backend.feed(match.id));
    } catch (err) {
      setError(err instanceof EditorError ? err.message : "Παραμένει σε αναμονή.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    const last = feed?.events.at(-1);
    if (!last || busy || !undoable(last)) return;
    setBusy(true);
    setError(null);
    try {
      setFeed(await backend.undo(match.id, last.id));
    } catch (err) {
      setError(err instanceof EditorError ? err.message : "Απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  const home = match.home_team;
  const away = match.away_team;

  /** Record a goal for `team`, with whatever the sheet came back with.
   *
   *  An own goal is filed against the side that put it in, and the server
   *  credits the other — the same rule the scoreboard already uses, so the
   *  volunteer taps the team they were watching rather than doing the
   *  arithmetic themselves. */
  function scored(team: Match["home_team"], choice: GoalChoice) {
    setScoring(null);
    void send(choice.ownGoal ? "own_goal" : "goal", team.id, {
      playerName: choice.playerName,
    });
  }

  /** Call the match off. The reason is the point: "ΑΝΑΒΟΛΗ" alone sends
   *  everybody to ask the same question in the same group chat. */
  function callOff(kind: "postponed" | "abandoned") {
    const reason = window.prompt(
      kind === "postponed"
        ? "Γιατί αναβλήθηκε; (π.χ. καιρός, γήπεδο)"
        : "Γιατί διακόπηκε;",
    );
    if (reason === null) return;
    void send(kind, undefined, { note: reason.trim() || null });
  }

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

      {(!online || queued > 0) && (
        <p className={styles.queue} role="status">
          {online ? "Αποστολή" : "Χωρίς σήμα"}
          {queued > 0 ? ` · ${queued} σε αναμονή` : ""}
          <span className={styles.queueHint}>
            Τα γεγονότα αποθηκεύονται και στέλνονται μόλις υπάρξει σύνδεση.
          </span>
        </p>
      )}

      {/* The clock runs itself from the kickoff entry; the field is an
          override for somebody correcting something from five minutes ago,
          which is a thing the clock cannot know. */}
      <label className={styles.minuteField}>
        Λεπτό
        <input
          className={styles.minuteInput}
          inputMode="numeric"
          value={minute}
          onChange={(e) => setMinute(e.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder={clock === null ? "—" : String(clock)}
          aria-label="Λεπτό αγώνα"
        />
        {clock !== null && minute === "" && (
          <span className={styles.minuteAuto}>αυτόματα</span>
        )}
      </label>

      <div className={styles.goals}>
        <button
          type="button"
          className={styles.goal}
          disabled={busy}
          onClick={() => (backend.roster ? setScoring(home) : send("goal", home.id))}
        >
          +1 ΓΚΟΛ
          <span className={styles.goalTeam}>{home.short_name ?? home.name}</span>
        </button>
        <button
          type="button"
          className={styles.goal}
          disabled={busy}
          onClick={() => (backend.roster ? setScoring(away) : send("goal", away.id))}
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

      {/* Below the ordinary markers and set apart, because they end the match
          rather than move it along. */}
      <div className={styles.markers}>
        <button
          type="button"
          className={`${styles.marker} ${styles.markerOff}`}
          disabled={busy}
          onClick={() => callOff("postponed")}
        >
          Αναβολή
        </button>
        <button
          type="button"
          className={`${styles.marker} ${styles.markerOff}`}
          disabled={busy}
          onClick={() => callOff("abandoned")}
        >
          Διακοπή
        </button>
      </div>

      {scoring && (
        <GoalSheet
          team={scoring.short_name ?? scoring.name}
          roster={roster ?? []}
          loading={rosterLoading}
          onPick={(choice) => scored(scoring, choice)}
          onClose={() => setScoring(null)}
        />
      )}

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
