"use client";

import { useEffect, useMemo, useState } from "react";

import { fold } from "@/lib/greek";
import styles from "./GoalSheet.module.css";

export interface RosterPlayer {
  slug: string;
  name: string;
  goals: number;
}

export interface GoalChoice {
  /** What the volunteer typed or picked. Null for "nobody knows yet". */
  playerName: string | null;
  /** An own goal counts for the other side, which the server works out. */
  ownGoal: boolean;
}

/** The scorer picker from screen V3, as a bottom sheet.
 *
 *  Opened by the goal button rather than replacing it: the goal is recorded
 *  either way, and the name is the optional part. Somebody standing in a crowd
 *  who cannot see who touched it last taps "Άγνωστος" and the goal still
 *  counts — asking for a name first is how the goal itself goes unrecorded.
 *
 *  The list is ordered by goals scored, because the three names at the top are
 *  the right answer nine times in ten, and searched without accents, because
 *  nobody types them on a phone keyboard.
 */
export function GoalSheet({
  team,
  roster,
  loading,
  onPick,
  onClose,
}: {
  team: string;
  roster: RosterPlayer[];
  loading: boolean;
  onPick: (choice: GoalChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const needle = fold(query.trim());
    if (needle.length === 0) return roster;
    return roster.filter((player) => fold(player.name).includes(needle));
  }, [roster, query]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Ποιος σκόραρε για ${team}`}
        // The sheet swallows the click that would otherwise close it.
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.grabber} aria-hidden="true" />

        <div className={styles.head}>
          <p className={styles.title}>Ποιος σκόραρε;</p>
          <p className={styles.sub}>{team}</p>
        </div>

        <div className={styles.quick}>
          <button
            type="button"
            className={styles.quickButton}
            onClick={() => onPick({ playerName: null, ownGoal: false })}
          >
            Άγνωστος
          </button>
          <button
            type="button"
            className={styles.quickButton}
            onClick={() => onPick({ playerName: null, ownGoal: true })}
          >
            Αυτογκόλ
          </button>
        </div>

        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Αναζήτηση παίκτη…"
          aria-label="Αναζήτηση παίκτη"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />

        <div className={styles.list}>
          {loading ? (
            <p className={styles.note}>Φόρτωση ρόστερ…</p>
          ) : shown.length === 0 ? (
            <p className={styles.note}>
              {roster.length === 0
                ? "Δεν υπάρχει ρόστερ για αυτή την ομάδα. Πάτα «Άγνωστος» — το γκολ μετράει ούτως ή άλλως."
                : `Κανένας παίκτης για «${query}».`}
            </p>
          ) : (
            shown.map((player) => (
              <button
                key={player.slug}
                type="button"
                className={styles.player}
                onClick={() => onPick({ playerName: player.name, ownGoal: false })}
              >
                <span className={styles.playerName}>{player.name}</span>
                {player.goals > 0 && (
                  <span className={styles.playerGoals}>{player.goals}</span>
                )}
              </button>
            ))
          )}
        </div>

        <button type="button" className={styles.cancel} onClick={onClose}>
          Άκυρο
        </button>
      </div>
    </div>
  );
}
