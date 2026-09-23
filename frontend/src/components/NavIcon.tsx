import type { NavItem } from "@/lib/nav";

/** A nav icon, drawn exactly as the design file draws it.
 *
 *  One stroked path on a 24×24 grid, sized by the caller. `currentColor` rather
 *  than a colour of its own: the design colours the icon and its label together
 *  — grey when idle, green when active — and two places to set that is one
 *  place for them to disagree.
 */
export function NavIcon({
  item,
  size = 22,
}: {
  item: Pick<NavItem, "icon" | "iconWidth">;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={item.icon}
        fill="none"
        stroke="currentColor"
        strokeWidth={item.iconWidth ?? 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
