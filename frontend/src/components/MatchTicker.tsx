"use client";

import useSWR from "swr";

import { apiUrl } from "@/lib/api";
import styles from "./MatchTicker.module.css";

export type EventKind =
  | "goal"
  | "penalty_goal"
  | "own_goal"
  | "penalty_miss"
  | "yellow"
  | "second_yellow"
  | "red"
  | "substitution"
  | "kickoff"
  | "halftime"
  | "second_half"
  | "fulltime"
  | "note";

export interface FeedEvent {
  id: number;
  kind: EventKind;
  minute: number | null;
  team: { id: number; slug: string; name: string; short_name: string | null } | null;
  player_name: string | null;
  note: string | null;
  created_at: string;
}

export interface MatchFeed {
  match_id: number;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  is_live: boolean;
  status: string;
  events: FeedEvent[];
}

/** Glyph and wording per kind. A single map, because the ticker, the
 *  secretary's screen and the share card all have to call the same thing the
 *  same name. */
export const EVENT_LABELS: Record<EventKind, { glyph: string; label: string }> = {
  goal: { glyph: "⚽", label: "Γκολ" },
  penalty_goal: { glyph: "⚽", label: "Γκολ από πέναλτι" },
  own_goal: { glyph: "⚽", label: "Αυτογκόλ" },
  penalty_miss: { glyph: "✖", label: "Χαμένο πέναλτι" },
  yellow: { glyph: "🟨", label: "Κίτρινη" },
  second_yellow: { glyph: "🟨", label: "Δεύτερη κίτρινη" },
  red: { glyph: "🟥", label: "Κόκκινη" },
  substitution: { glyph: "⇄", label: "Αλλαγή" },
  kickoff: { glyph: "▶", label: "Σέντρα" },
  halftime: { glyph: "⏸", label: "Ημίχρονο" },
  second_half: { glyph: "▶", label: "Β΄ ημίχρονο" },
  fulltime: { glyph: "⏹", label: "Τελικό" },
  note: { glyph: "✎", label: "Σημείωση" },
};

const fetcher = async (url: string): Promise<MatchFeed> => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

/** The running log of a match.
 *
 *  Shown only once there is something in it. Most matches here have no log at
 *  all — nobody was at the ground with the screen open — and an empty "ΡΟΗ
 *  ΓΕΓΟΝΟΤΩΝ" heading on every page would read as a broken feature rather than
 *  an unused one.
 */
export function MatchTicker({ matchId }: { matchId: number }) {
  const { data } = useSWR<MatchFeed>(
    apiUrl(`/matches/${matchId}/feed`),
    fetcher,
    // Only while it is running. Polling a finished match forever costs the
    // reader's battery to re-read a log that cannot change.
    {
      refreshInterval: (latest) => (latest?.is_live ? 15_000 : 0),
      revalidateOnFocus: true,
    },
  );

  if (!data || data.events.length === 0) return null;

  // Newest first: somebody opening this mid-match wants the last thing that
  // happened, not the kickoff.
  const events = [...data.events].reverse();

  return (
    <section className={styles.box}>
      <h2 className={styles.title}>
        Ροή γεγονότων
        {data.is_live && (
          <span className={styles.live}>
            <span className={styles.pulse} aria-hidden="true" />
            {data.minute !== null ? `${data.minute}′` : "LIVE"}
          </span>
        )}
      </h2>

      <ol className={styles.list}>
        {events.map((event) => {
          const { glyph, label } = EVENT_LABELS[event.kind];
          const scoring =
            event.kind === "goal" ||
            event.kind === "penalty_goal" ||
            event.kind === "own_goal";
          return (
            <li
              key={event.id}
              className={`${styles.row} ${scoring ? styles.scoring : ""}`}
            >
              <span className={styles.minute}>
                {event.minute !== null ? `${event.minute}′` : "—"}
              </span>
              <span className={styles.glyph} aria-hidden="true">
                {glyph}
              </span>
              <span className={styles.detail}>
                <span className={styles.what}>
                  {label}
                  {event.team ? ` — ${event.team.short_name ?? event.team.name}` : ""}
                </span>
                {(event.player_name || event.note) && (
                  <span className={styles.who}>
                    {[event.player_name, event.note].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className={styles.source}>
        Καταγραφή από τον αγώνα, όχι από την ένωση. Ο σκόρερ μπορεί να
        συμπληρωθεί αργότερα.
      </p>
    </section>
  );
}
