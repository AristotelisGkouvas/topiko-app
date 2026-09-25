"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { apiUrl, jsonFetcher } from "@/lib/api";
import { useFavourite } from "@/lib/favourite";
import {
  EVENT_GROUPS,
  currentEndpoint,
  readPrefs,
  writePrefs,
  type TeamPrefs,
} from "@/lib/notifyApi";
import { Toggle } from "./Toggle";
import styles from "./page.module.css";

/** Screen N1: what to send, for which club, and when not to.
 *
 *  Three states, and they are genuinely different: this browser cannot receive
 *  notifications at all, it can but has not subscribed to anything, or it has.
 *  A single "turn on notifications" button would be wrong for the first (it
 *  cannot work) and for the third (they are already on).
 */

const DEFAULT_QUIET = { from: 23, to: 8 };

type State =
  | { status: "loading" }
  | { status: "unsupported" }
  | { status: "none" }
  | { status: "ready"; endpoint: string; teams: TeamPrefs[] };

export function NotifySettings() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const { data: push } = useSWR<{ enabled: boolean; public_key: string | null }>(
    apiUrl("/push/config"),
    jsonFetcher,
  );
  const { clubs } = useFavourite();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState({ status: "unsupported" });
        return;
      }
      const endpoint = await currentEndpoint();
      if (cancelled) return;
      if (!endpoint) {
        setState({ status: "none" });
        return;
      }
      try {
        const teams = await readPrefs(endpoint);
        if (!cancelled) {
          setState(
            teams.length > 0
              ? { status: "ready", endpoint, teams }
              : { status: "none" },
          );
        }
      } catch {
        if (!cancelled) setState({ status: "none" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <p className={styles.loading}>Φόρτωση…</p>;
  }

  if (state.status === "unsupported") {
    return (
      <div className={styles.page}>
        <Empty
          title="Χωρίς ειδοποιήσεις εδώ"
          body="Αυτό το πρόγραμμα περιήγησης δεν υποστηρίζει ειδοποιήσεις. Σε iPhone δουλεύουν αφού προσθέσεις την εφαρμογή στην αρχική οθόνη."
        />
      </div>
    );
  }

  // Without push keys on the server there is nothing to switch on anywhere;
  // sending the reader to a club page to find a button that is not there was
  // a dead end.
  if (state.status === "none" && push && !(push.enabled && push.public_key)) {
    return (
      <div className={styles.page}>
        <Empty
          title="Οι ειδοποιήσεις δεν λειτουργούν ακόμη"
          body="Ετοιμάζονται. Μέχρι τότε, το ημερολόγιο του σωματείου σου ενημερώνει μόνο του για ώρες και αναβολές."
          action={
            clubs.length > 0
              ? { href: `/somateia/${clubs[0].slug}`, label: "Ημερολόγιο σωματείου" }
              : undefined
          }
        />
      </div>
    );
  }

  if (state.status === "none") {
    return (
      <div className={styles.page}>
        <Empty
          title="Δεν έχεις ενεργές ειδοποιήσεις"
          body={
            clubs.length > 0
              ? `Άνοιξέ τες από τη σελίδα του σωματείου — ${clubs[0].name}, για παράδειγμα.`
              : "Διάλεξε πρώτα ένα σωματείο και άνοιξε τις ειδοποιήσεις από τη σελίδα του."
          }
          action={
            clubs.length > 0
              ? { href: `/somateia/${clubs[0].slug}`, label: "Στη σελίδα του σωματείου" }
              : { href: "/somateia", label: "Δες τα σωματεία" }
          }
        />
      </div>
    );
  }

  const { endpoint, teams } = state;
  // The window is a property of the phone, so every row carries the same one.
  const quietFrom = teams[0]?.quiet_from ?? null;
  const quietTo = teams[0]?.quiet_to ?? null;
  const quietOn = quietFrom !== null && quietTo !== null;

  async function save(next: TeamPrefs[], team?: string, prefs?: Record<string, boolean>) {
    setState({ status: "ready", endpoint, teams: next });
    setSaving(true);
    try {
      await writePrefs({
        endpoint,
        team_slug: team,
        prefs,
        quiet_from: next[0]?.quiet_from ?? null,
        quiet_to: next[0]?.quiet_to ?? null,
      });
    } catch {
      // The switch stays where the reader put it and the next change retries.
      // Bouncing it back would say the tap did not register, which is a
      // different and more alarming failure than one that did not save.
    } finally {
      setSaving(false);
    }
  }

  function setGroup(slug: string, group: string, value: boolean) {
    void save(
      teams.map((t) =>
        t.team_slug === slug ? { ...t, prefs: { ...t.prefs, [group]: value } } : t,
      ),
      slug,
      { [group]: value },
    );
  }

  function setQuiet(on: boolean) {
    void save(
      teams.map((t) => ({
        ...t,
        quiet_from: on ? DEFAULT_QUIET.from : null,
        quiet_to: on ? DEFAULT_QUIET.to : null,
      })),
    );
  }

  return (
    <div className={styles.page}>
      {teams.map((team) => (
        <section key={team.team_slug} className={styles.group}>
          <p className={styles.groupLabel}>
            {(clubs.find((c) => c.slug === team.team_slug)?.name ??
              team.team_slug).toLocaleUpperCase("el-GR")}
          </p>
          <div className={styles.card}>
            {EVENT_GROUPS.map((group, i) => (
              <div
                key={group.key}
                className={`${styles.row} ${
                  i === EVENT_GROUPS.length - 1 ? styles.rowLast : ""
                }`}
              >
                <span className={styles.names}>
                  <span className={styles.name}>{group.label}</span>
                  {group.note && <span className={styles.note}>{group.note}</span>}
                </span>
                <Toggle
                  checked={team.prefs[group.key] ?? false}
                  disabled={saving}
                  label={`${group.label} — ${team.team_slug}`}
                  onChange={(next) => setGroup(team.team_slug, group.key, next)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className={styles.group}>
        <p className={styles.groupLabel}>ΚΟΙΝΕΣ ΡΥΘΜΙΣΕΙΣ</p>
        <div className={styles.card}>
          <div className={`${styles.row} ${styles.rowLast}`}>
            <span className={styles.names}>
              <span className={styles.name}>Ήσυχες ώρες</span>
              <span className={styles.note}>
                {quietOn
                  ? `${String(quietFrom).padStart(2, "0")}:00 – ${String(quietTo).padStart(2, "0")}:00`
                  : "Τίποτα δεν σιωπά"}
              </span>
            </span>
            <Toggle
              checked={quietOn}
              disabled={saving}
              label="Ήσυχες ώρες"
              onChange={setQuiet}
            />
          </div>
        </div>
      </section>

      <p className={styles.footnote}>
        Οι ειδοποιήσεις ρυθμίζονται ανά ομάδα. Οι ήσυχες ώρες ισχύουν για όλες,
        με την ώρα του κινητού σου. Για να τις κλείσεις εντελώς, χρησιμοποίησε
        τον διακόπτη στη <Link href="/somateia">σελίδα του σωματείου</Link>.
      </p>
    </div>
  );
}
