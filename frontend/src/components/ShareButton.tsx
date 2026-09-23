"use client";

import { useState } from "react";

/** The design's "Κοινοποίηση" button.
 *
 *  Uses the phone's own share sheet when it has one, which is where somebody
 *  wants a ground's page to go — into the group chat that is arranging the
 *  lift. Falls back to copying the link, because on a desktop browser there is
 *  no sheet and a dead button is worse than a quiet one.
 */
export function ShareButton({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  const [said, setSaid] = useState<string | null>(null);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSaid("Αντιγράφηκε");
    } catch {
      // Cancelled, or both APIs blocked. Nothing failed that the reader needs
      // told about — they simply did not share.
    }
  }

  return (
    <button type="button" className={className} onClick={share}>
      {said ?? "Κοινοποίηση"}
    </button>
  );
}
