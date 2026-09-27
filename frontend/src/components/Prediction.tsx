"use client";

import { track } from "@/lib/analytics";
import { useState } from "react";
import useSWR from "swr";

import { Crest } from "@/components/Crest";
import { SectionHeader } from "@/components/SectionHeader";
import { apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import { listName, plural } from "@/lib/format";
import type { CrestSubject, PredictionChoice as Choice, PredictionPoll } from "@/lib/types";
import { voterToken } from "@/lib/voter";
import styles from "./Prediction.module.css";

type Side = CrestSubject & { short_name?: string | null };

/** Πρόβλεψη φιλάθλων: 1 / Χ / 2 in one row, the split as one bar after.
 *
 *  Laid out like the head-to-head bar above it — home on the left, away on
 *  the right — so the two read as a pair: what happened before, and what
 *  people think happens now. Percentages stay hidden until you have voted,
 *  so the crowd cannot lead the crowd.
 */
export function Prediction({
  matchId,
  home,
  away,
}: {
  matchId: number;
  home: Side;
  away: Side;
}) {
  const [token] = useState<string | null>(() =>
    typeof window === "undefined" ? null : voterToken(),
  );
  const [busy, setBusy] = useState(false);

  const url = apiUrl(
    `/matches/${matchId}/prognostiko${token ? `?voter=${token}` : ""}`,
  );
  const { data, mutate } = useSWR<PredictionPoll>(token ? url : null, jsonFetcher<PredictionPoll>);

  // A closed poll nobody voted in is nothing to show.
  if (!data || (!data.open && data.total === 0)) return null;

  async function vote(choice: Choice) {
    if (!token || busy) return;
    track("prediction", { match: matchId, choice });
    setBusy(true);
    try {
      const poll = await apiFetch<PredictionPoll>(
        apiUrl(`/matches/${matchId}/prognostiko`),
        { method: "POST", json: { choice, voter: token } },
      );
      mutate(poll, { revalidate: false });
    } catch {
      // Closed at kickoff, or throttled: show whatever the server now holds.
      mutate();
    } finally {
      setBusy(false);
    }
  }

  const shown = data.revealed && data.total > 0;
  const pct = (n: number) => Math.round((n / data.total) * 100);

  const button = (key: Choice, mark: string, label: string, crest?: Side) => {
    const picked = data.mine === key;
    return (
      <button
        type="button"
        className={`${styles.choice} ${picked ? styles.picked : ""}`}
        disabled={!data.open || busy}
        onClick={() => vote(key)}
        aria-pressed={picked}
        aria-label={label}
        title={label}
      >
        {crest && key === "home" && <Crest team={crest} size="xs" />}
        <span className={styles.mark}>{mark}</span>
        {crest && key === "away" && <Crest team={crest} size="xs" />}
      </button>
    );
  };

  return (
    <section className={styles.section}>
      <SectionHeader title="ΠΡΟΒΛΕΨΗ ΦΙΛΑΘΛΩΝ" />
      <div className={styles.card}>
        {data.open && (
          <div className={styles.choices}>
            {/* Names that start with the visible mark, so "πάτα 1" works by
                voice (WCAG 2.5.3). */}
            {button("home", "1", `1 – Νίκη ${listName(home)}`, home)}
            {button("draw", "Χ", "Χ – Ισοπαλία")}
            {button("away", "2", `2 – Νίκη ${listName(away)}`, away)}
          </div>
        )}

        {shown ? (
          <>
            <div className={styles.legend}>
              <span>
                <strong>{pct(data.home)}%</strong> 1
              </span>
              <span>Χ {pct(data.draw)}%</span>
              <span>
                2 <strong>{pct(data.away)}%</strong>
              </span>
            </div>
            <div
              className={styles.bar}
              role="img"
              aria-label={`${listName(home)} ${pct(data.home)}%, ισοπαλία ${pct(data.draw)}%, ${listName(away)} ${pct(data.away)}%`}
            >
              <span className={styles.barHome} style={{ width: `${pct(data.home)}%` }} />
              <span className={styles.barDraw} style={{ width: `${pct(data.draw)}%` }} />
              <span className={styles.barAway} style={{ width: `${pct(data.away)}%` }} />
            </div>
            <p className={styles.sub}>
              {data.total} {plural(data.total, "ψήφος", "ψήφοι")}
              {data.open ? "" : " πριν από τη σέντρα"}
            </p>
          </>
        ) : (
          <p className={styles.sub}>
            {data.open
              ? "Μόνο για τη χαρά του παιχνιδιού — χωρίς στοίχημα. Τα ποσοστά φαίνονται αφού ψηφίσεις."
              : "Η ψηφοφορία έκλεισε με τη σέντρα."}
          </p>
        )}
      </div>
    </section>
  );
}
