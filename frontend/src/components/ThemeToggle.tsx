"use client";

import { useSyncExternalStore } from "react";

export type Theme = "system" | "light" | "dark";

const KEY = "pamesentra:theme";

const listeners = new Set<() => void>();
let current: Theme = "system";
let loaded = false;

function read(): Theme {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

/** Put the choice on <html>, where the CSS is looking for it.
 *
 *  "system" removes the attribute rather than setting it, because the media
 *  query is the fallback — an attribute saying "system" would have to be
 *  matched by a rule that then cannot know what the system wants.
 */
function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  // The browser chrome follows. Left alone it stays navy in a dark page,
  // which reads as a rendering fault rather than a choice.
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0e1d30" : "#003c71");
}

function subscribe(listener: () => void) {
  if (!loaded) {
    current = read();
    loaded = true;
    apply(current);
  }
  listeners.add(listener);

  // Following the system means following it as it changes, not only at load.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (current === "system") apply("system");
  };
  media.addEventListener("change", onSystem);

  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystem);
  };
}

function set(theme: Theme) {
  current = theme;
  try {
    if (theme === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked. The choice still holds for this visit.
  }
  apply(theme);
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    // The server cannot know, and guessing produces a flash of the wrong one.
    () => "system" as Theme,
  );
  return { theme, set };
}

const NEXT: Record<Theme, Theme> = {
  system: "dark",
  dark: "light",
  light: "system",
};

const LABEL: Record<Theme, { glyph: string; text: string }> = {
  system: { glyph: "◐", text: "Αυτόματο" },
  dark: { glyph: "☾", text: "Σκούρο" },
  light: { glyph: "☀", text: "Ανοιχτό" },
};

/** Three states, one button.
 *
 *  A two-state switch cannot express "follow my phone", which is what most
 *  people actually want and what the site does before anyone touches it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, set } = useTheme();
  const label = LABEL[theme];

  return (
    <button
      type="button"
      className={className}
      onClick={() => set(NEXT[theme])}
      title={`Θέμα: ${label.text}`}
      aria-label={`Θέμα: ${label.text}. Αλλαγή σε ${LABEL[NEXT[theme]].text}.`}
    >
      <span aria-hidden="true">{label.glyph}</span>
    </button>
  );
}
