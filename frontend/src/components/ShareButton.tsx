"use client";

import { useState } from "react";

import { Icon } from "./Icon";

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
  url: path,
  className,
  iconOnly = false,
}: {
  title: string;
  /** A ready sentence for the chat — "Ζίτσα–Πωγώνι, Πέμ 16:00, Δημ. Στάδιο". */
  text?: string;
  /** What to share, when it is not this page — "/agones/123" from the
   *  volunteer's sheet, whose own address is no use to anybody else. */
  url?: string;
  className?: string;
  /** The share glyph instead of the word; the word stays as its name. */
  iconOnly?: boolean;
}) {
  const [said, setSaid] = useState<string | null>(null);

  async function share() {
    const url = path ? new URL(path, window.location.origin).href : window.location.href;
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
    <>
      <button
        type="button"
        className={className}
        onClick={share}
        aria-label={iconOnly ? "Κοινοποίηση" : undefined}
        title={iconOnly ? "Κοινοποίηση" : undefined}
      >
        {iconOnly ? <Icon name="share" size={22} /> : (said ?? "Κοινοποίηση")}
      </button>
      {/* Outside the button: a live region inside a named button is not
          announced by several screen readers, and "Αντιγράφηκε" must be. */}
      {iconOnly && (
        <span className="srOnly" aria-live="polite">
          {said ?? ""}
        </span>
      )}
    </>
  );
}
