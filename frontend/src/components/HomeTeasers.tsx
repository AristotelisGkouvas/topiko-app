"use client";

import Link from "next/link";
import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import { plural } from "@/lib/format";
import type { MvpPoll, OnThisDay } from "@/lib/types";
import styles from "./HomeTeasers.module.css";

/** The reasons to open the site on a Tuesday.
 *
 *  The vote and the anniversaries lived two taps deep under "Περισσότερα",
 *  and a home page that never mentioned them was a home page for Sundays only.
 *  Each card appears only when it has something to say. */
export function HomeTeasers() {
  const { data: poll } = useSWR<MvpPoll | null>(apiUrl("/mvp"), jsonFetcher, {
    revalidateOnFocus: false,
  });
  const { data: day } = useSWR<OnThisDay>(apiUrl("/san-simera"), jsonFetcher, {
    revalidateOnFocus: false,
  });

  const vote = poll?.open ? poll : null;
  const anniversary = day?.matches[0];
  if (!vote && !anniversary) return null;

  return (
    <div className={styles.row}>
      {vote && (
        <Link href="/mvp" className={styles.card}>
          <span className={styles.kicker}>ΠΑΙΚΤΗΣ ΑΓΩΝΙΣΤΙΚΗΣ</span>
          <span className={styles.title}>
            Ψήφισε τον καλύτερο της {vote.matchday}ης · {vote.league_name}
          </span>
          <span className={styles.meta}>
            {vote.candidates.length}{" "}
            {plural(vote.candidates.length, "υποψήφιος", "υποψήφιοι")} ›
          </span>
        </Link>
      )}
      {anniversary && (
        <Link href="/san-simera" className={styles.card}>
          <span className={styles.kicker}>ΣΑΝ ΣΗΜΕΡΑ</span>
          <span className={styles.title}>
            {anniversary.home_team.short_name ?? anniversary.home_team.name}{" "}
            {anniversary.home_score}–{anniversary.away_score}{" "}
            {anniversary.away_team.short_name ?? anniversary.away_team.name}
          </span>
          <span className={styles.meta}>
            {anniversary.kickoff_at ? new Date(anniversary.kickoff_at).getFullYear() : ""}
            {day!.matches.length > 1
              ? ` · και άλλοι ${day!.matches.length - 1} ›`
              : " ›"}
          </span>
        </Link>
      )}
    </div>
  );
}
