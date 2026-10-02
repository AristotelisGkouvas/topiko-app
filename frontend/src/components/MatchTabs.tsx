"use client";

import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

import styles from "./MatchTabs.module.css";

export interface MatchTab {
  /** Also the `?tab=` value, so a link can open the line-ups directly. */
  id: string;
  label: string;
  panel: ReactNode;
}

/** The tabs under the match header (screen 03 v2).
 *
 *  Every panel is rendered on the server and only hidden, so a search engine
 *  reads the line-ups and the table as well as the summary, and switching is
 *  instant. The choice goes into the address with replaceState: shareable,
 *  without a round trip or a history entry per tap. */
export function MatchTabs({ tabs, initial }: { tabs: MatchTab[]; initial?: string }) {
  const [active, setActive] = useState(
    tabs.some((t) => t.id === initial) ? initial! : tabs[0].id,
  );
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(id: string) {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === tabs[0].id) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(window.history.state, "", url);
  }

  // Arrow keys move along the row, as in any tab list.
  function onKey(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + tabs.length) % tabs.length;
    choose(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <>
      <div className={styles.bar} role="tablist" aria-label="Ενότητες αγώνα">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            className={styles.tab}
            onClick={() => choose(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className={styles.panel}
        >
          {t.panel}
        </div>
      ))}
    </>
  );
}
