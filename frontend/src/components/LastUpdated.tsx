"use client";

import { useEffect, useState } from "react";

import { formatRelative, freshness } from "@/lib/format";
import styles from "./LastUpdated.module.css";

const TICK_MS = 30_000;

/**
 * "● Ενημερώθηκε πριν 4 λεπτά · epsip.gr"
 *
 * Always sits under the page title, never in a modal. The dot encodes freshness:
 * green under 15 minutes, ochre under a day, terracotta when the data is stale
 * enough that the reader should not trust it.
 */
export function LastUpdated({
  timestamp,
  sourceUrl,
  suffix,
}: {
  timestamp: string | null;
  sourceUrl?: string | null;
  /** Extra clause between the time and the source, e.g. "μετά την 14η αγωνιστική". */
  suffix?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const state = freshness(timestamp, now);
  const host = sourceUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const parts = [
    state === "offline" && timestamp === null
      ? "Χωρίς δεδομένα"
      : state === "offline"
        ? // Not "offline": the reader is online, the data is old. The red dot
          // already says "do not trust this"; the words only say since when.
          `Τελευταία ενημέρωση ${formatRelative(timestamp, now)}`
        : `Ενημερώθηκε ${formatRelative(timestamp, now)}`,
    suffix,
    host,
  ].filter(Boolean);

  return (
    <p className={styles.row}>
      <span
        className={`${styles.dot} ${styles[state]}`}
        aria-hidden="true"
      />
      {/* Server and client render this a second or two apart, which is exactly
          the mismatch this attribute exists for. */}
      <span suppressHydrationWarning>{parts.join(" · ")}</span>
    </p>
  );
}
