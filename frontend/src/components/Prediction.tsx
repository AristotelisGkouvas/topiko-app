"use client";

import { useState } from "react";
import useSWR from "swr";

import { apiFetch, apiUrl, jsonFetcher } from "@/lib/api";
import type { PredictionChoice as Choice, PredictionPoll } from "@/lib/types";
import { voterToken } from "@/lib/voter";
import styles from "./Prediction.module.css";
import { plural } from "@/lib/format";

export function Prediction({
  matchId,
  homeName,
  awayName,
}: {
  matchId: number;
  homeName: string;
  awayName: string;
}) {
  const [token] = useState<string | null>(() =>
    typeof window === "undefined" ? null : voterToken(),
  );
  const [busy, setBusy] = useState(false);

  const url = apiUrl(
    `/matches/${matchId}/prognostiko${token ? `?voter=${token}` : ""}`,
  );
  const { data, mutate } = useSWR<PredictionPoll>(token ? url : null, jsonFetcher<PredictionPoll>);

  // A closed poll nobody voted in is nothing to show. It used to take the best
  // spot on the page of every live and every old match to say so.
  if (!data || (!data.open && data.total === 0)) return null;

  async function vote(choice: Choice) {
    if (!token || busy) return;
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

  const options: { key: Choice; label: string; count: number }[] = [
    { key: "home", label: homeName, count: data.home },
    { key: "draw", label: "Ισοπαλία", count: data.draw },
    { key: "away", label: awayName, count: data.away },
  ];

  return (
    <section className={styles.box}>
      <h2 className={styles.title}>Τι λέει το χωριό;</h2>
      <p className={styles.sub}>
        {data.open
          ? "Χωρίς στοίχημα. Τα ποσοστά φαίνονται αφού ψηφίσεις."
          : `${data.total} ${plural(data.total, "ψήφος", "ψήφοι")} πριν τη σέντρα`}
      </p>

      <ul className={styles.options}>
        {options.map((option) => {
          const share =
            data.revealed && data.total > 0
              ? Math.round((option.count / data.total) * 100)
              : null;
          const picked = data.mine === option.key;

          return (
            <li key={option.key}>
              <button
                type="button"
                className={`${styles.option} ${picked ? styles.picked : ""}`}
                disabled={!data.open || busy}
                onClick={() => vote(option.key)}
                aria-pressed={picked}
              >
                {/* The bar sits behind the label rather than beside it, so a
                    long club name never squeezes the percentage off the row. */}
                {share !== null && (
                  <span
                    className={styles.bar}
                    style={{ width: `${share}%` }}
                    aria-hidden="true"
                  />
                )}
                <span className={styles.label}>{option.label}</span>
                {share !== null && (
                  <span className={styles.share}>{share}%</span>
                )}
                {picked && (
                  <span className={styles.tick} aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {!data.open && data.mine === null && (
        <p className={styles.missed}>Δεν πρόλαβες να ψηφίσεις σε αυτόν.</p>
      )}
    </section>
  );
}
