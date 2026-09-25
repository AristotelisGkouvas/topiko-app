"use client";

import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { EventKind, MatchFeed } from "@/lib/types";
import styles from "./MatchTicker.module.css";

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
  postponed: { glyph: "⌛", label: "Αναβολή" },
  abandoned: { glyph: "⛔", label: "Διακοπή" },
  note: { glyph: "✎", label: "Σημείωση" },
};

const REPORTERS = { club: "εθελοντής σωματείου", association: "ένωση" } as const;

/** The running log of a match.
 *
 *  Shown once there is something in it — or while the match is live, when
 *  even a bare score with no log needs its minute and its state said. A
 *  finished match with no log shows nothing: most matches here have none, and
 *  an empty "ΡΟΗ ΓΕΓΟΝΟΤΩΝ" on every page would read as a broken feature.
 */
export function MatchTicker({
  matchId,
  homeName,
  awayName,
}: {
  matchId: number;
  /** For the spoken score: "Ζίτσα 2, Πωγώνι 1" rather than "2–1". */
  homeName?: string;
  awayName?: string;
}) {
  const { data } = useSWR<MatchFeed>(
    apiUrl(`/matches/${matchId}/feed`),
    jsonFetcher<MatchFeed>,
    // Only while it is running. Polling a finished match forever costs the
    // reader's battery to re-read a log that cannot change.
    {
      refreshInterval: (latest) => (latest?.is_live ? 15_000 : 0),
      revalidateOnFocus: true,
    },
  );

  if (!data || (data.events.length === 0 && !data.is_live)) return null;

  // Newest first: somebody opening this mid-match wants the last thing that
  // happened, not the kickoff.
  const events = [...data.events].reverse();
  const latest = events[0];
  const scored = data.home_score !== null && data.away_score !== null;

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

      {/* Polite, so a screen reader says the new score when it changes
          without cutting into whatever it is reading. */}
      <p className={styles.status} aria-live="polite" aria-atomic="true">
        {data.status === "halftime"
          ? "Ημίχρονο"
          : data.is_live
            ? "Σε εξέλιξη"
            : "Τελικό"}
        {scored
          ? homeName && awayName
            ? ` · ${homeName} ${data.home_score}, ${awayName} ${data.away_score}`
            : ` · ${data.home_score}–${data.away_score}`
          : ""}
        {latest?.reported_by
          ? ` · Ενημερώνει: ${REPORTERS[latest.reported_by]}, ${formatRelative(latest.created_at)}`
          : ""}
      </p>

      {events.length === 0 && (
        <p className={styles.source}>
          Δεν έχουν καταγραφεί ακόμη γεγονότα για αυτόν τον αγώνα.
        </p>
      )}

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

      {events.length > 0 && (
        <p className={styles.source}>
          Καταγραφή από τον αγώνα· η ένωση επιβεβαιώνει αργότερα. Ο σκόρερ
          μπορεί να συμπληρωθεί εκ των υστέρων.
        </p>
      )}
    </section>
  );
}
