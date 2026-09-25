"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { EVENT_LABELS } from "@/components/MatchTicker";
import { GoalSheet, type GoalChoice } from "@/components/GoalSheet";
import type { EventKind, MatchFeed, RosterPlayer } from "@/lib/types";
import { Empty } from "@/components/States";
import { ApiError } from "@/lib/api";
import { editorApi } from "@/lib/editorApi";
import {
  dismissRejected,
  enqueue,
  flush,
  newClientId,
  pending,
  rejected,
  useOnline,
  useOutboxSize,
} from "@/lib/outbox";
import { formatDayDate, formatTime } from "@/lib/format";
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

const UNDO_EXPIRED =
  "Πέρασε το λεπτό για αναίρεση. Για διόρθωση, ενημέρωσε την ένωση.";

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
/** "16:05" typed on a kickoff entry: when the whistle actually went. */
const CLOCK_NOTE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** When the match started, as the clock should count it.
 *
 *  The kickoff entry's own time, unless its note carries the real one — a
 *  volunteer who arrives at 16:20 and presses Σέντρα for a 16:00 start would
 *  otherwise put every goal twenty minutes early. Without any kickoff entry,
 *  the scheduled time, while the match could plausibly be running: a sheet
 *  opened mid-match with no Σέντρα pressed used to file every event with no
 *  minute at all. */
function clockStart(
  feed: MatchFeed,
  scheduled: string | null,
  now: number,
): number | null {
  const kickoff = feed.events.find((e) => e.kind === "kickoff");
  if (kickoff) {
    const typed = kickoff.note?.trim().match(CLOCK_NOTE);
    if (typed) {
      const at = new Date(kickoff.created_at);
      at.setHours(Number(typed[1]), Number(typed[2]), 0, 0);
      return at.getTime();
    }
    return new Date(kickoff.created_at).getTime();
  }
  if (!scheduled) return null;
  const start = new Date(scheduled).getTime();
  const since = now - start;
  return since > 0 && since < 3 * 60 * 60_000 ? start : null;
}

function useMatchClock(
  feed: MatchFeed | null,
  scheduled: string | null,
): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Ticked rather than read during render, which would be impure and would
    // disagree between two renders of the same data.
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!feed) return null;

  const start = clockStart(feed, scheduled, now);
  if (start === null) return null;

  const stopped = feed.events.some(
    (e) => e.kind === "halftime" || e.kind === "fulltime",
  );
  const last = feed.events.at(-1);
  if (stopped && last) {
    // Frozen at whatever the last entry said, so the number on screen matches
    // the one in the log rather than drifting through the interval.
    return last.minute ?? null;
  }

  const elapsed = (now - start) / 60_000;
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
  /** Whose roster that is. The opponent's goals get the free-name sheet,
   *  not a list of our own players. */
  ownTeamSlug?: string;
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
    // Today's and live matches first: a club's list is the whole season,
    // and on a Sunday the one that matters was eighteen rows down. Sorted
    // here, in the fetcher, so the clock is read outside render.
    async () => {
      const all = await backend.matches();
      const today = formatDayDate(new Date().toISOString());
      const now = (m: Match) => m.is_live || formatDayDate(m.kickoff_at) === today;
      return [...all.filter(now), ...all.filter((m) => !now(m))];
    },
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
            {/* The day as well as the hour: a club's list spans the whole
                season, and "16:00" eighteen times tells nobody which Sunday. */}
            <span className={styles.pickTime}>
              <span className={styles.pickDay}>
                {formatDayDate(match.kickoff_at)}
              </span>
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
  const clock = useMatchClock(feed, match.kickoff_at);

  // The undo button has to go grey on its own once the minute is up. Without
  // this it stayed enabled and a tap did nothing, so people kept tapping.
  // The newest entry by id, not the last in the list: the feed is ordered by
  // minute, so a correction typed for the 20th minute sits mid-list and
  // "undo last" was taking back something else.
  const lastEvent = feed?.events.length
    ? feed.events.reduce((a, b) => (b.id > a.id ? b : a))
    : undefined;
  // Two quick taps read the same `busy` from one render and both went
  // through — a double yellow from one tap. A ref is read at the moment.
  const sending = useRef(false);
  const [refused, setRefused] = useState(() => rejected());
  const waiting = typeof window === "undefined" ? [] : pending().filter((e) => e.match_id === match.id);
  void queued; // re-render on queue changes so `waiting` stays current
  const [expiredId, setExpiredId] = useState<number | null>(null);
  useEffect(() => {
    if (!lastEvent) return;
    const left =
      UNDO_WINDOW_MS - (Date.now() - new Date(lastEvent.created_at).getTime());
    const timer = setTimeout(() => setExpiredId(lastEvent.id), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [lastEvent]);
  const undoExpired = !!lastEvent && expiredId === lastEvent.id;

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
        const fresh = await backend.feed(match.id).catch(() => null);
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
  }, [match.id, backend]);

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
    if (sending.current) return;
    const parsedMinute = minute === "" ? null : Number.parseInt(minute, 10);
    if (parsedMinute !== null && (parsedMinute < 0 || parsedMinute > 130)) {
      setError("Το λεπτό πρέπει να είναι από 0 έως 130.");
      return;
    }
    // The log is the score: the first entry recomputes it from the entries,
    // and a result typed earlier by the desk or read from the federation
    // would vanish without a word. Say so before it happens.
    const existing = (feed?.home_score ?? 0) + (feed?.away_score ?? 0);
    if (
      feed &&
      feed.events.length === 0 &&
      existing > 0 &&
      !window.confirm(
        `Ο αγώνας έχει ήδη σκορ ${feed.home_score}–${feed.away_score} χωρίς καταγεγραμμένα γκολ. ` +
          "Από το πρώτο γεγονός το σκορ θα μετράει μόνο όσα καταχωρήσεις εδώ. Συνέχεια;",
      )
    ) {
      return;
    }
    sending.current = true;
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
    // One entry per typed minute: left in the box, every later event was
    // filed at the same minute.
    setMinute("");

    try {
      const result = await flush();
      if (result.blocked) setError(result.blocked);
      if (result.sent > 0) setFeed(await backend.feed(match.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Παραμένει σε αναμονή.");
    } finally {
      setRefused(rejected());
      sending.current = false;
      setBusy(false);
    }
  }

  async function undo() {
    const last = lastEvent;
    if (!last || sending.current) return;
    if (!undoable(last)) {
      setError(UNDO_EXPIRED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setFeed(await backend.undo(match.id, last.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Απέτυχε.");
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

  /** Σέντρα — now, or at the time it really happened.
   *
   *  Pressed well after the scheduled start, it asks. Otherwise every minute
   *  after it is counted from the moment somebody found the button. */
  function kickOff() {
    const late =
      match.kickoff_at !== null &&
      Date.now() - new Date(match.kickoff_at).getTime() > 5 * 60_000;
    if (!late) {
      void send("kickoff");
      return;
    }
    const answer = window.prompt(
      "Ο αγώνας έχει ήδη ξεκινήσει; Γράψε την ώρα της σέντρας (π.χ. 16:05) ή άφησέ το κενό για «τώρα».",
      formatTime(match.kickoff_at),
    );
    if (answer === null) return;
    const typed = answer.trim();
    if (typed && !CLOCK_NOTE.test(typed)) {
      setError("Η ώρα γράφεται ως ΗΗ:ΛΛ, π.χ. 16:05.");
      return;
    }
    void send("kickoff", undefined, { note: typed || null });
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
        // Sticky: it has to stay in sight while the volunteer scrolls the log.
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
          onClick={() => setScoring(home)}
        >
          +1 ΓΚΟΛ
          <span className={styles.goalTeam}>{home.short_name ?? home.name}</span>
        </button>
        <button
          type="button"
          className={styles.goal}
          disabled={busy}
          onClick={() => setScoring(away)}
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
        <button type="button" className={styles.marker} disabled={busy} onClick={kickOff}>
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
          // Our players only for our goals; the opponent's scorer is typed.
          roster={scoring.slug === backend.ownTeamSlug ? (roster ?? []) : []}
          loading={scoring.slug === backend.ownTeamSlug && rosterLoading}
          onPick={(choice) => scored(scoring, choice)}
          onClose={() => setScoring(null)}
        />
      )}

      <button
        type="button"
        className={styles.undo}
        disabled={busy || !feed?.events.length || undoExpired}
        onClick={undo}
      >
        ↶ Αναίρεση
        {lastEvent && (
          <span className={styles.undoWhat}>
            {EVENT_LABELS[lastEvent.kind].label}
            {lastEvent.team ? ` ${lastEvent.team.short_name ?? lastEvent.team.name}` : ""}
            {lastEvent.minute !== null ? ` ${lastEvent.minute}′` : ""}
          </span>
        )}
      </button>
      {undoExpired && !error && <p className={styles.hint}>{UNDO_EXPIRED}</p>}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {refused
        .filter((e) => e.match_id === match.id)
        .map((e) => (
          <p key={e.client_id} className={styles.error} role="alert">
            Δεν καταχωρήθηκε: {EVENT_LABELS[e.kind as EventKind]?.label ?? e.kind}
            {e.minute !== undefined ? ` (${e.minute}′)` : ""} — {e.reason}{" "}
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => {
                dismissRejected(e.client_id);
                setRefused(rejected());
              }}
            >
              Εντάξει
            </button>
          </p>
        ))}

      {/* Waiting for a signal: shown in the log so the volunteer sees the
          goal was taken, not only a counter. */}
      {waiting.length > 0 && (
        <ol className={styles.log} aria-label="Σε αναμονή αποστολής">
          {[...waiting].reverse().map((e) => (
            <li key={e.client_id} className={`${styles.logRow} ${styles.logWaiting}`}>
              <span className={styles.logMinute}>
                {e.minute !== undefined ? `${e.minute}′` : "—"}
              </span>
              <span>
                ⏳ {EVENT_LABELS[e.kind as EventKind]?.label ?? e.kind}
                {e.team_id === home.id
                  ? ` — ${home.short_name ?? home.name}`
                  : e.team_id === away.id
                    ? ` — ${away.short_name ?? away.name}`
                    : ""}
              </span>
            </li>
          ))}
        </ol>
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
