"use client";

import { useState } from "react";

import styles from "./ScoreFlash.module.css";

/** A score that lights up for a moment when it changes.
 *
 *  A goal in a live match used to be a number quietly turning into another
 *  one, easy to miss while glancing at a list. The first value is the one the
 *  page loaded with and never flashes; every later one does, once. `key` is
 *  the value, so a second goal remounts the span and plays it again.
 *
 *  The volunteer's sheet has its own flash (MatchSheet's boardFlash); this is
 *  the public side. Screen readers hear goals through the live regions that
 *  already exist, not through this. Reduced motion: tokens.css flattens it.
 */
export function ScoreFlash({ value }: { value: number | null }) {
  const [initial] = useState(value);
  return (
    <span key={value ?? "none"} className={value !== initial ? styles.flash : undefined}>
      {value}
    </span>
  );
}
