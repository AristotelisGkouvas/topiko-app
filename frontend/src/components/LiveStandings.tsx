"use client";

import { useState } from "react";
import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import type { LiveTable } from "@/lib/types";
import styles from "./LiveStandings.module.css";
import { pollEvery } from "@/lib/network";

/** "Αν τελείωνε τώρα" — the table with every match in progress counted.
 *
 *  Offered only while something is actually being played. A toggle that
 *  changes nothing invites the reader to press it and conclude the feature is
 *  broken, so on a quiet Tuesday this renders nothing at all.
 */
export function LiveStandings({ leagueSlug }: { leagueSlug: string }) {
  const [open, setOpen] = useState(false);

  const { data } = useSWR<LiveTable>(
    apiUrl(`/leagues/${leagueSlug}/standings/live`),
    jsonFetcher<LiveTable>,
    // Matched to the live-score strip. Faster would mostly re-fetch a table
    // that only moves when a goal is entered by hand.
    // Only while something is being played: with nothing live this renders
    // nothing, and polling it anyway cost a 3G reader 0.7 MB an hour.
    {
      refreshInterval: (latest) => (latest?.live_matches ? pollEvery(20_000) : 0),
      revalidateOnFocus: true,
    },
  );

  if (!data || data.live_matches === 0) return null;

  const moved = data.rows.filter(
    (row) => row.actual_position !== null && row.actual_position !== row.position,
  ).length;

  return (
    <section className={styles.box}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span className={styles.pulse} aria-hidden="true" />
        <span className={styles.label}>
          Αν τελείωνε τώρα
          <span className={styles.sub}>
            {data.live_matches} σε εξέλιξη
            {moved > 0 ? ` · ${moved} αλλάζουν θέση` : " · καμία αλλαγή θέσης"}
          </span>
        </span>
        <span className={styles.chevron} aria-hidden="true">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <ol className={styles.rows}>
          {data.rows.map((row) => {
            const from = row.actual_position;
            const delta = from === null ? 0 : from - row.position;
            return (
              <li key={row.team.id} className={styles.row}>
                <span className={styles.position}>{row.position}</span>
                <span
                  className={`${styles.move} ${
                    delta > 0 ? styles.up : delta < 0 ? styles.down : ""
                  }`}
                >
                  {/* The number as well as the arrow: colour and direction
                      alone do not survive a greyscale screen or a reader. */}
                  {delta === 0 ? "—" : `${delta > 0 ? "▲" : "▼"}${Math.abs(delta)}`}
                </span>
                <span className={styles.team}>{row.team.name}</span>
                <span className={styles.points}>{row.points}</span>
              </li>
            );
          })}
        </ol>
      )}

      <p className={styles.note}>
        Υπολογισμός, όχι επίσημη βαθμολογία. Μετράει τα σκορ των αγώνων που
        παίζονται αυτή τη στιγμή σαν να ήταν τελικά.
      </p>
    </section>
  );
}
