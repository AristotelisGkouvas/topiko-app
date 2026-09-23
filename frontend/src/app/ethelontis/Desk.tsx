"use client";

import { useEffect, useState } from "react";

import { MatchSheet, type SheetBackend } from "@/components/MatchSheet";
import { volunteerApi, type Volunteer } from "@/lib/volunteerApi";
import { CodeForm } from "./CodeForm";
import styles from "./page.module.css";

/** The club's own matches, through the same sheet the dashboard uses.
 *
 *  Not this club's *home* matches — all of them. A representative travels with
 *  the team, and the away game is exactly the one the federation hears about
 *  last.
 */
const BACKEND: SheetBackend = {
  key: "ethelontis:sheet",
  matches: async () => (await volunteerApi.matches()) ?? [],
  feed: async (matchId) => (await volunteerApi.feed(matchId))!,
  undo: async (matchId, eventId) => (await volunteerApi.undo(matchId, eventId))!,
  via: "ethelontis",
  empty: {
    title: "Κανένας αγώνας",
    body: "Δεν βρέθηκε αγώνας του σωματείου σου για τη φετινή σεζόν.",
  },
};

type State = { status: "checking" } | { status: "out" } | { status: "in"; who: Volunteer };

export function Desk() {
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    // Asked once, on load: the session is an httpOnly cookie, so the only way
    // to know whether there is one is to try using it.
    volunteerApi
      .me()
      .then((who) => {
        if (!cancelled) setState(who ? { status: "in", who } : { status: "out" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "out" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "checking") {
    return <p className={styles.loading}>Φόρτωση…</p>;
  }

  if (state.status === "out") {
    return <CodeForm onIn={(who) => setState({ status: "in", who })} />;
  }

  return (
    <>
      <header className={styles.who}>
        <div>
          <p className={styles.whoLabel}>Δηλώνεις για</p>
          <p className={styles.whoName}>{state.who.team_name}</p>
          {state.who.label && (
            <p className={styles.whoWho}>{state.who.label}</p>
          )}
        </div>
        <button
          type="button"
          className={styles.logout}
          onClick={async () => {
            await volunteerApi.logout().catch(() => undefined);
            setState({ status: "out" });
          }}
        >
          Αποσύνδεση
        </button>
      </header>

      <MatchSheet backend={BACKEND} />

      <p className={styles.small}>
        Μπορείς να δηλώσεις από τρεις ώρες πριν τη σέντρα μέχρι έξι ώρες μετά.
        Για διόρθωση εκτός αυτού, μίλα με την ένωση.
      </p>
    </>
  );
}
