"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { LEAGUE_COOKIE } from "@/lib/leagueCookie";
import styles from "./SiteHeader.module.css";

export interface PickerLeague {
  slug: string;
  label: string;
}

/** Write the choice down. Outside the component on purpose: assigning to
 *  `document.cookie` inside one is a mutation the compiler refuses, and it is
 *  not component state anyway — it is a note left for the next request.
 *
 *  A year: long enough that somebody who visits every Sunday never chooses
 *  twice, short enough to lapse for somebody who has moved on.
 */
function remember(slug: string) {
  try {
    document.cookie = `${LEAGUE_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // Cookies blocked. The navigation still carries the choice for this page,
    // which is the part that matters right now.
  }
}

/** The division chip in the phone header — "Α΄ Κατηγορία ▾".
 *
 *  Choosing writes `ps_league` as well as navigating, so the choice survives
 *  into pages that were not linked with `?liga=`. The cookie is a preference,
 *  never an override: a link somebody shares carries its own division and wins.
 *
 *  A `<details>` rather than a menu built from state: it opens on click and on
 *  Enter, closes on Escape, and is keyboard-reachable without any of that being
 *  written here.
 */
export function LeaguePicker({
  leagues,
  active,
}: {
  leagues: PickerLeague[];
  active: PickerLeague | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const picker = useRef<HTMLDetailsElement>(null);

  // The header outlives every navigation, so a <details> left open after a
  // pick stayed open over the next page. Same rules as the header's menus:
  // closes on a pick, on a click or focus anywhere else, and on Escape.
  useEffect(() => {
    const close = (event: Event) => {
      const el = picker.current;
      if (el?.open && !el.contains(event.target as Node)) el.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      const el = picker.current;
      if (event.key === "Escape" && el?.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("focusin", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("focusin", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!active || leagues.length < 2) return null;

  function choose(slug: string) {
    if (picker.current) picker.current.open = false;
    remember(slug);
    // Read at click time from the address bar rather than through
    // useSearchParams. That hook opts the whole tree out of prerendering
    // unless it is wrapped in Suspense — and this component sits in the root
    // layout, so the tree is every page, including the static 404.
    const next = new URLSearchParams(window.location.search);
    next.set("liga", slug);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <details ref={picker} className={styles.league}>
      <summary className={styles.leagueChip}>
        {active.label}
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className={styles.leaguePanel}>
        {leagues.map((league) => (
          <button
            key={league.slug}
            type="button"
            className={`${styles.leagueItem} ${
              league.slug === active.slug ? styles.leagueItemOn : ""
            }`}
            aria-current={league.slug === active.slug ? "true" : undefined}
            onClick={() => choose(league.slug)}
          >
            {league.label}
          </button>
        ))}
      </div>
    </details>
  );
}
