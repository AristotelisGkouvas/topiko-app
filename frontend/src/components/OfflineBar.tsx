"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clockTime, markSeen, useSavedAt } from "@/lib/freshness";
import { flush, useOnline, useOutboxSize } from "@/lib/outbox";
import styles from "./OfflineBar.module.css";

/** What the reader sees when the signal goes.
 *
 *  Half the grounds in Epirus have no reception behind the goal, so this is
 *  not an edge case — it is the second half of most Sundays. The page they are
 *  looking at keeps working; what it must not do is quietly show them Saturday
 *  and let them believe it is now.
 *
 *  So the bar says two things: that there is no connection, and *when* what
 *  they are reading was fetched. "Χωρίς σύνδεση" on its own leaves them
 *  guessing how stale the score is, which is the question they actually have.
 *
 *  Screen E1 places it as a full-width amber strip directly under the header,
 *  not as a floating card at the bottom — and dims the stale content beneath it
 *  to 75%. Both matter: a strip in the flow pushes the old data down instead of
 *  covering it, and the dimming is what stops a saved table being read as a
 *  live one. The dimming rule lives in globals.css, keyed off this element.
 */
export function OfflineBar() {
  const online = useOnline();
  const queued = useOutboxSize();
  const router = useRouter();
  const pathname = usePathname();
  const savedAtMs = useSavedAt(pathname);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Stamped on arrival, while the connection is up — that is when what is on
    // screen actually came from the network. Reading the clock at the moment
    // it drops would print the time of the failure and call it the time of the
    // data, which is the one thing this must not do.
    if (online) markSeen(pathname);
  }, [online, pathname]);

  if (online) return null;

  const savedAt = savedAtMs === null ? null : clockTime(savedAtMs);

  async function retry() {
    setRetrying(true);
    try {
      // Both: anything waiting in the queue goes out, and the page asks the
      // server again. Either can succeed while the other does not.
      await flush().catch(() => undefined);
      router.refresh();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className={styles.bar} role="status" data-offline="">
      <span className={styles.text}>
        Χωρίς σύνδεση
        {savedAt && <> · αποθηκευμένα {savedAt}</>}
        {queued > 0 && <> · {queued} σε αναμονή</>}
      </span>
      <button
        type="button"
        className={styles.retry}
        onClick={retry}
        disabled={retrying}
      >
        {retrying ? "…" : "Δοκίμασε ξανά"}
      </button>
    </div>
  );
}
