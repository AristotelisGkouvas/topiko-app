"use client";

import useSWR from "swr";

import { MatchCard } from "./MatchCard";
import { apiUrl } from "@/lib/api";
import type { Match } from "@/lib/types";
import styles from "./LiveMatches.module.css";

/**
 * Polling, not websockets.
 *
 * An amateur league has a handful of concurrent matches and a few hundred
 * readers; a 20s poll of one indexed endpoint answers the whole use case at
 * zero infrastructure cost. SSE or websockets are worth it only once this is
 * demonstrably not enough.
 */
const POLL_MS = 20_000;

const fetcher = async (url: string): Promise<Match[]> => {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

export function LiveMatches({ initial }: { initial: Match[] }) {
  const { data, error } = useSWR<Match[]>(apiUrl("/matches/live"), fetcher, {
    refreshInterval: POLL_MS,
    fallbackData: initial,
    // Coming back to the tab should show current scores immediately.
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const matches = data ?? [];

  if (matches.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="live-heading">
      <header className={styles.header}>
        <h2 id="live-heading" className={styles.heading}>
          Τώρα ζωντανά
        </h2>
        <span className={styles.count}>
          {matches.length} {matches.length === 1 ? "αγώνας" : "αγώνες"}
        </span>
      </header>

      {/* A failed poll keeps the last known scores on screen rather than
          blanking them — stale is more useful than empty here. */}
      {error && (
        <p className={styles.error}>
          Η ανανέωση απέτυχε· τα σκορ ίσως δεν είναι τρέχοντα.
        </p>
      )}

      <div className={styles.grid}>
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </section>
  );
}
