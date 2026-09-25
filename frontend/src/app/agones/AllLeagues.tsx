"use client";

import useSWR from "swr";

import { CopyText } from "@/components/CopyText";
import { MatchRow } from "@/components/MatchRow";
import { Empty } from "@/components/States";
import { apiUrl, jsonFetcher } from "@/lib/api";
import { roundText } from "@/lib/shareText";
import type { League, Match } from "@/lib/types";
import styles from "./page.module.css";
import { pollEvery } from "@/lib/network";

// lib/leagues reads cookies on the server and cannot come into the browser.
const leagueLabel = (league: League) => league.short_name ?? league.name;

/** Every division's weekend on one screen — "Όλες" in the chips.
 *
 *  Grouped by division in the federation's own order. Polled while anything
 *  is live, like the home page's strip, so a Sunday evening reader can leave
 *  it open. */
export function AllLeagues({ leagues }: { leagues: League[] }) {
  const { data, isLoading } = useSWR<Match[]>(apiUrl("/matches/weekend"), jsonFetcher, {
    refreshInterval: (latest) => (latest?.some((m) => m.is_live) ? pollEvery(20_000) : 0),
  });

  if (isLoading && !data) return <p className={styles.note}>Φόρτωση…</p>;
  if (!data?.length) {
    return (
      <Empty
        title="Κανένας αγώνας αυτό το Σαββατοκύριακο"
        body="Δεν υπάρχει αναμέτρηση σε καμία κατηγορία από Παρασκευή ως Δευτέρα."
      />
    );
  }

  const byLeague = new Map<number, Match[]>();
  for (const match of data) {
    byLeague.set(match.league_id, [...(byLeague.get(match.league_id) ?? []), match]);
  }
  const groups = leagues
    .filter((l) => byLeague.has(l.id))
    .map((l) => [l, byLeague.get(l.id)!] as const);

  const text = groups
    .map(([league, matches]) => roundText(leagueLabel(league), matches))
    .join("\n\n");

  return (
    <div className={styles.days}>
      <div>
        <CopyText text={text} label="Αντιγραφή όλων ως κείμενο" />
      </div>
      {groups.map(([league, matches]) => (
        <section key={league.id} className={styles.day}>
          <p className={styles.dayLabel}>{leagueLabel(league)}</p>
          <div className={styles.card}>
            {matches.map((match, i) => (
              <MatchRow
                key={match.id}
                match={match}
                last={i === matches.length - 1}
                showDate
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
