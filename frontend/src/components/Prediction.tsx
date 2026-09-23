"use client";

import { useState } from "react";
import useSWR from "swr";

import { apiUrl } from "@/lib/api";
import styles from "./Prediction.module.css";

type Choice = "home" | "draw" | "away";

interface Poll {
  match_id: number;
  open: boolean;
  total: number;
  home: number;
  draw: number;
  away: number;
  mine: Choice | null;
  revealed: boolean;
}

const KEY = "pamesentra:voter";

/** A token this browser keeps, so a second visit is recognised as the same
 *  person without anyone having to register.
 *
 *  Created on first use rather than at import: generating one for every reader
 *  who never votes would write to storage on a page they only read.
 */
function voterToken(): string | null {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID().replace(/-/g, "");
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode or storage blocked. Voting simply is not offered rather
    // than being offered and silently failing.
    return null;
  }
}

const fetcher = async (url: string): Promise<Poll> => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

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
  const { data, mutate } = useSWR<Poll>(token ? url : null, fetcher);

  if (!data) return null;

  async function vote(choice: Choice) {
    if (!token || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        apiUrl(`/matches/${matchId}/prognostiko`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ choice, voter: token }),
        },
      );
      if (response.ok) mutate(await response.json(), { revalidate: false });
      else mutate();
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
          : data.total > 0
            ? `${data.total} ${data.total === 1 ? "ψήφος" : "ψήφοι"} πριν τη σέντρα`
            : "Η ψηφοφορία έκλεισε χωρίς ψήφους."}
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

      {!data.open && data.mine === null && data.total > 0 && (
        <p className={styles.missed}>Δεν πρόλαβες να ψηφίσεις σε αυτόν.</p>
      )}
    </section>
  );
}
