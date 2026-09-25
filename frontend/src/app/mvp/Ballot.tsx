"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Empty } from "@/components/States";
import { castVote, readPoll, voterToken } from "@/lib/mvpApi";
import type { MvpPoll } from "@/lib/types";
import styles from "./page.module.css";
import { plural } from "@/lib/format";

/** Screens M1 and M3: the ballot, and the result once you have used it.
 *
 *  One screen rather than two. The design draws them separately because they
 *  look different, but they are the same list — voting turns the counts on.
 *  Keeping them as one view means the name a reader just chose stays where it
 *  was on the screen instead of jumping into a new order.
 */
export function Ballot() {
  const [poll, setPoll] = useState<MvpPoll | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    readPoll(voterToken())
      .then((result) => {
        if (!cancelled) setPoll(result);
      })
      .catch(() => {
        if (!cancelled) setPoll(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (poll === undefined) {
    return <p className={styles.loading}>Φόρτωση…</p>;
  }

  if (poll === null) {
    return (
      <div className={styles.page}>
        <Empty
          title="Καμία ψηφοφορία ανοιχτή"
          body="Η ένωση ανοίγει την ψηφοφορία για τον παίκτη της αγωνιστικής μετά το τέλος κάθε αγωνιστικής."
          action={{ href: "/agones", label: "Δες τους αγώνες" }}
        />
      </div>
    );
  }

  const voted = poll.my_vote !== null;
  const total = poll.total_votes ?? 0;

  async function choose(candidateId: number) {
    if (busy || !poll?.open) return;
    setBusy(true);
    setError(null);
    try {
      setPoll(await castVote(poll.id, candidateId, voterToken()));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <p className={styles.round}>
        {poll.league_name} · {poll.matchday}η αγωνιστική
        {!poll.open && " · έκλεισε"}
      </p>

      <ul className={styles.list}>
        {poll.candidates.map((candidate) => {
          const mine = poll.my_vote === candidate.id;
          const share =
            candidate.votes !== null && total > 0
              ? Math.round((candidate.votes / total) * 100)
              : null;

          return (
            <li key={candidate.id}>
              <button
                type="button"
                className={`${styles.candidate} ${mine ? styles.chosen : ""}`}
                aria-pressed={mine}
                disabled={busy || !poll.open}
                onClick={() => choose(candidate.id)}
              >
                {/* The bar is the background of the row once the counts are
                    known, so the numbers and the shape are the same object
                    rather than a figure and a chart of the figure. */}
                {share !== null && (
                  <span
                    className={styles.bar}
                    style={{ width: `${share}%` }}
                    aria-hidden="true"
                  />
                )}

                <span className={styles.crest} aria-hidden="true">
                  {candidate.team_name?.slice(0, 2) ?? "—"}
                </span>

                <span className={styles.names}>
                  <span className={styles.name}>{candidate.player_name}</span>
                  <span className={styles.meta}>
                    {[candidate.team_name, candidate.reason]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                {share !== null ? (
                  <span className={styles.share}>
                    {share}%
                    <span className={styles.count}>{candidate.votes}</span>
                  </span>
                ) : (
                  mine && <span className={styles.tick}>✓</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <p className={styles.note}>
        {!poll.open
          ? `Η ψηφοφορία έκλεισε. ${total} ${plural(total, "ψήφος", "ψήφοι")}.`
          : voted
            ? `Ψήφισες. ${total} ${plural(total, "ψήφος", "ψήφοι")} ως τώρα — μπορείς να αλλάξεις γνώμη όσο είναι ανοιχτή.`
            : "Διάλεξε έναν. Τα αποτελέσματα φαίνονται μόλις ψηφίσεις."}
      </p>

      <p className={styles.small}>
        Η ψήφος συνδέεται με αυτό το πρόγραμμα περιήγησης και όχι με λογαριασμό.
        Είναι μια κυριακάτικη ψηφοφορία, όχι εκλογές.{" "}
        <Link href={`/vathmologia?liga=${poll.league_slug}`}>
          Βαθμολογία {poll.league_name} ›
        </Link>
      </p>
    </div>
  );
}
