/** The interface icons that are not in the tab bar, drawn the same way as the
 *  nav icons (see NavIcon and lib/nav.ts): stroked paths on a 24×24 grid,
 *  round caps, coloured by `currentColor`.
 *
 *  They replace the typographic glyphs the site used (⌕ ☆ ★ ⌚ 🔔 ⚑ ◐ ✕ ⌖ ⚽).
 *  A glyph is drawn by whatever font the phone has — a different shape, size
 *  and baseline on every device, an emoji on some — and several had no good
 *  character at all.
 *
 *  Always decorative: the control around the icon carries the words. */

export const ICON_PATHS = {
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 20 20",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  calendar: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  ball: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8.5l3.3 2.4-1.3 3.9h-4l-1.3-3.9zM12 4v4.5M15.3 10.9l4.3-1.4M14 14.8l2.6 3.6M10 14.8l-2.6 3.6M8.7 10.9 4.4 9.5",
  pin: "M12 21s-6-5.7-6-11a6 6 0 0 1 12 0c0 5.3-6 11-6 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  flag: "M6 21V4M6 4h11l-2 4 2 4H6",
  close: "M6 6l12 12M18 6 6 18",
  auto: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 4v16",
  moon: "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  // Match events (MatchTicker, the secretary's log).
  miss: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9 9l6 6M15 9l-6 6",
  card: "M8 4h8v16H8z",
  swap: "M4 8h13l-3-3M20 16H7l3 3",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  stop: "M6 6h12v12H6z",
  hourglass: "M7 4h10M7 20h10M8 4c0 5 8 6 8 16M16 4c0 5-8 6-8 16",
  abandoned: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM6.5 6.5l11 11",
  note: "M5 19l1-4L16 5l3 3L9 18z",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  size = 18,
  filled = false,
  className,
}: {
  name: IconName;
  size?: number;
  /** Solid shape instead of an outline — the followed star. */
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flex: "none", display: "block" }}
    >
      <path
        d={ICON_PATHS[name]}
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
