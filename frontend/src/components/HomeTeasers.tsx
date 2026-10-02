"use client";

import Link from "next/link";
import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import { plural } from "@/lib/format";
import type { MvpPoll, OnThisDay } from "@/lib/types";
import styles from "./HomeTeasers.module.css";

const dayMonth = new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "short", timeZone: "Europe/Athens" });

/** The reasons to open the site on a Tuesday, as one card (design "Home"):
 *  the vote for the player of the round on a pale navy ground, when there is
 *  one, and a match played on this day in an earlier year.
 *
 *  Each half appears only when it has something to say. */
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

  const year = anniversary?.kickoff_at ? new Date(anniversary.kickoff_at).getFullYear() : null;

  return (
    <div className={styles.card}>
      {vote && (
        <Link href="/mvp" className={styles.vote}>
          <span className={styles.voteKicker}>ΠΑΙΚΤΗΣ ΤΗΣ {vote.matchday}ης ΑΓΩΝΙΣΤΙΚΗΣ</span>
          <span className={styles.voteTitle}>Ψήφισε τον καλύτερο</span>
          <span className={styles.voteMeta}>
            {vote.league_name} · {vote.candidates.length}{" "}
            {plural(vote.candidates.length, "υποψήφιος", "υποψήφιοι")} ›
          </span>
        </Link>
      )}
      {anniversary && (
        <div className={styles.day}>
          <span className={styles.kicker}>
            ΣΑΝ ΣΗΜΕΡΑ · {dayMonth.format(new Date()).toLocaleUpperCase("el-GR")}
          </span>
          <Link href={`/agones/${anniversary.id}`} className={styles.story}>
            {year ? `${year}: ` : ""}
            {anniversary.home_team.name} {anniversary.home_score}–{anniversary.away_score}{" "}
            {anniversary.away_team.name}
          </Link>
          <Link href="/san-simera" className={styles.more}>
            {day!.matches.length > 1 ? `Και άλλοι ${day!.matches.length - 1} ›` : "Περισσότερα ›"}
          </Link>
        </div>
      )}
    </div>
  );
}
