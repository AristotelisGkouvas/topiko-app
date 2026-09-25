"use client";

import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import type { EventKind, MatchFeed } from "@/lib/types";
import styles from "./MatchTicker.module.css";
import { Icon, type IconName } from "@/components/Icon";
import { pollEvery } from "@/lib/network";

/** Icon and wording per kind. A single map, because the ticker and the
 *  secretary's screen have to call the same thing the same name.
 *
 *  Icons, not emoji: ⚽ 🟨 🟥 are drawn by the phone's emoji font, at its
 *  size and in its colours, and on older Android as boxes. Cards keep their
 *  colour through a class, since that colour is the whole meaning. */
export const EVENT_LABELS: Record<
  EventKind,
  { icon: IconName; tone?: "yellow" | "red"; label: string }
> = {
  goal: { icon: "ball", label: "Γκολ" },
  penalty_goal: { icon: "ball", label: "Γκολ από πέναλτι" },
  own_goal: { icon: "ball", label: "Αυτογκόλ" },
  penalty_miss: { icon: "miss", label: "Χαμένο πέναλτι" },
  yellow: { icon: "card", tone: "yellow", label: "Κίτρινη" },
  second_yellow: { icon: "card", tone: "yellow", label: "Δεύτερη κίτρινη" },
  red: { icon: "card", tone: "red", label: "Κόκκινη" },
  substitution: { icon: "swap", label: "Αλλαγή" },
  kickoff: { icon: "play", label: "Σέντρα" },
  halftime: { icon: "pause", label: "Ημίχρονο" },
  second_half: { icon: "play", label: "Β΄ ημίχρονο" },
  fulltime: { icon: "stop", label: "Τελικό" },
  postponed: { icon: "hourglass", label: "Αναβολή" },
  abandoned: { icon: "abandoned", label: "Διακοπή" },
  note: { icon: "note", label: "Σημείωση" },
};

/** The icon for one event kind, cards filled in their colour. */
export function EventGlyph({ kind, size = 16 }: { kind: EventKind; size?: number }) {
  const { icon, tone } = EVENT_LABELS[kind];
  return (
    <span
      className={`${styles.eventIcon} ${tone ? styles[tone] : ""}`}
      aria-hidden="true"
    >
      <Icon name={icon} size={size} filled={Boolean(tone)} />
    </span>
  );
}

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
      refreshInterval: (latest) => (latest?.is_live ? pollEvery(15_000) : 0),
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
          const { label } = EVENT_LABELS[event.kind];
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
              <span className={styles.glyph}>
                <EventGlyph kind={event.kind} />
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
