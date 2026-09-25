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
  text,
  className,
}: {
  title: string;
  /** A ready sentence for the chat — "Ζίτσα–Πωγώνι, Πέμ 16:00, Δημ. Στάδιο". */
  text?: string;
  className?: string;
}) {
  const [said, setSaid] = useState<string | null>(null);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(text ? `${text}
${url}` : url);
      setSaid("Αντιγράφηκε");
    } catch (error) {
      // Closing the share sheet is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Neither API available: hand the link over to copy by hand, rather
      // than a button that silently does nothing.
      window.prompt("Αντέγραψε τον σύνδεσμο:", url);
    }
  }

  return (
    <button type="button" className={className} onClick={share}>
      {said ?? "Κοινοποίηση"}
    </button>
  );
}
