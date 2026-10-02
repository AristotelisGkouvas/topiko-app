"use client";

import Link from "next/link";
import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { MOMENT_LABELS, type Moment, feedMoments, isGoal } from "@/lib/moments";
import { pollEvery } from "@/lib/network";
import type { MatchFeed } from "@/lib/types";
import { Icon } from "@/components/Icon";
import styles from "./MatchTimeline.module.css";

const REPORTERS = { club: "εθελοντής σωματείου", association: "ένωση" } as const;

/** Screen 03 v2: goals, cards and changes, one block per half, the home side
 *  down the left and the away side down the right.
 *
 *  From the federation's report once there is one; until then from the live
 *  log, polled while the match runs. */
export function MatchTimeline({
  matchId,
  homeTeamId,
  sheet,
  halfScores,
  live,
}: {
  matchId: number;
  homeTeamId: number;
  /** The report's moments, when it has been read. */
  sheet: Moment[] | null;
  /** Each half's score where the result gives it ("1 - 0"); otherwise the
   *  goals in the block are counted. */
  halfScores: [string | null, string | null];
  live: boolean;
}) {
  const { data } = useSWR<MatchFeed>(
    sheet ? null : apiUrl(`/matches/${matchId}/feed`),
    jsonFetcher<MatchFeed>,
    // Only while it is running: a finished log cannot change.
    {
      refreshInterval: (latest) => (latest?.is_live ? pollEvery(15_000) : 0),
      revalidateOnFocus: true,
    },
  );

  const moments = sheet ?? (data ? feedMoments(data, homeTeamId) : []);
  const latest = data?.events.at(-1);

  if (moments.length === 0) {
    return live ? (
      <p className={styles.empty}>Δεν έχουν καταγραφεί ακόμη φάσεις για αυτόν τον αγώνα.</p>
    ) : null;
  }

  return (
    <section aria-label="Φάσεις αγώνα">
      {([1, 2] as const).map((n) => {
        const rows = moments.filter((m) => m.half === n);
        if (rows.length === 0) return null;
        const home = rows.filter((m) => isGoal(m.kind) && m.home).length;
        const away = rows.filter((m) => isGoal(m.kind) && !m.home).length;
        return (
          <div key={n}>
            <h3 className={styles.band}>
              <span>{n === 1 ? "1ο ΗΜΙΧΡΟΝΟ" : "2ο ΗΜΙΧΡΟΝΟ"}</span>
              <span>{halfScores[n - 1] ?? `${home} - ${away}`}</span>
            </h3>
            <ol className={styles.list}>
              {rows.map((m, i) => (
                <Row key={i} m={m} />
              ))}
            </ol>
          </div>
        );
      })}
      <p className={styles.source}>
        {sheet
          ? "Από το φύλλο αγώνα της ένωσης."
          : `Καταγραφή από τον αγώνα· η ένωση επιβεβαιώνει αργότερα.${
              latest?.reported_by
                ? ` Ενημερώνει: ${REPORTERS[latest.reported_by]}, ${formatRelative(latest.created_at)}.`
                : ""
            }`}
      </p>
    </section>
  );
}

function Row({ m }: { m: Moment }) {
  const minute =
    m.minute == null ? "" : m.stoppage ? `${m.minute}+${m.stoppage}'` : `${m.minute}'`;
  return (
    <li className={`${styles.row} ${m.home ? "" : styles.away}`}>
      <span className={styles.minute}>{minute}</span>
      <span className={styles.glyph} role="img" aria-label={MOMENT_LABELS[m.kind]}>
        <Glyph kind={m.kind} />
      </span>
      <span className={styles.who}>
        <span className={styles.name}>
          {m.href ? <Link href={m.href}>{m.name}</Link> : m.name}
        </span>
        {m.note && <span className={styles.note}>{m.note}</span>}
      </span>
      {m.score && <span className={styles.score}>{m.score}</span>}
    </li>
  );
}

/** Cards drawn, not typed: 🟨 and 🟥 come out orange and pink on some phones. */
function Glyph({ kind }: { kind: Moment["kind"] }) {
  if (isGoal(kind)) return <Icon name="ball" size={16} />;
  if (kind === "penalty_miss") return <Icon name="miss" size={16} />;
  if (kind === "sub") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path className={styles.in} d="M5 13V3M2 6l3-3 3 3" />
        <path className={styles.out} d="M11 3v10M8 10l3 3 3-3" />
      </svg>
    );
  }
  if (kind === "second_yellow") {
    return (
      <span className={styles.pair} aria-hidden="true">
        <span className={`${styles.card} ${styles.yellow}`} />
        <span className={`${styles.card} ${styles.red}`} />
      </span>
    );
  }
  return (
    <span
      className={`${styles.card} ${kind === "red" ? styles.red : styles.yellow}`}
      aria-hidden="true"
    />
  );
}
