/** The brand mark: a goal, seen head on, with the net behind it.
 *
 *  Taken from the Brand Assets canvas (σήμα 11a). Drawn in `currentColor` so
 *  the same file works on the navy header bar, on a white card and inside a
 *  generated share image — the kit ships navy, solid-navy and grass variants
 *  of one shape rather than three files.
 */
export function Logo({
  size = 28,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  // The artwork is 104x92; keeping the ratio stops the crossbar thinning out.
  const height = Math.round((size * 92) / 104);

  return (
    <svg
      viewBox="0 0 104 92"
      width={size}
      height={height}
      className={className}
      style={{ display: "block" }}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <g fill="currentColor">
        <rect x="6" y="6" width="92" height="11" />
        <rect x="6" y="6" width="11" height="86" />
        <rect x="87" y="6" width="11" height="86" />
      </g>
      {/* The net. Held back to 40% so the frame still reads at 20px. */}
      <path
        d="M31 17V92 M46 17V92 M61 17V92 M76 17V92 M17 32H87 M17 52H87 M17 72H87"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity=".4"
        fill="none"
      />
    </svg>
  );
}
