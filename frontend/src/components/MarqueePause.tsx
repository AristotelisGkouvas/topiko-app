"use client";

import { useEffect, useRef, useState } from "react";

/** Stops a moving sponsor strip, for anybody who cannot or will not chase it
 *  (WCAG 2.2.2) — hover already pauses it, but a keyboard or a screen reader
 *  has no hover. Also brings a plate that receives keyboard focus fully into
 *  view, instead of leaving it under the strip's faded edge. */
export function MarqueePause() {
  const ref = useRef<HTMLButtonElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const strip = ref.current?.closest("section");
    if (!strip) return;
    strip.toggleAttribute("data-paused", paused);
  }, [paused]);

  useEffect(() => {
    const strip = ref.current?.closest("section");
    if (!strip) return;
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && e.target !== ref.current) {
        e.target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    };
    strip.addEventListener("focusin", onFocus);
    return () => strip.removeEventListener("focusin", onFocus);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="marqueePause"
      aria-pressed={paused}
      aria-label={paused ? "Συνέχεια κίνησης χορηγών" : "Παύση κίνησης χορηγών"}
      title={paused ? "Συνέχεια" : "Παύση"}
      onClick={() => setPaused((p) => !p)}
    >
      <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
    </button>
  );
}
