/** The brand mark: mown grass.
 *
 *  From Logo Set 3b, which UI Kit v4 adopts — "το γρασίδι είναι το σήμα· το
 *  navy μένει το χρώμα της εφαρμογής". It replaces the goal frame of the
 *  earlier Brand Assets sheet.
 *
 *  Drawn with a repeating gradient rather than an SVG: the stripes are the
 *  whole idea, and a gradient keeps them crisp at any size without a viewBox
 *  to scale. The generated icons draw the same stripes as pixels.
 */
/** The mark's edge length: whatever CSS says, else what the caller asked for.
 *
 *  Every other number in the mark and the wordmark is a fraction of this one,
 *  which is why it is worth threading through calc() rather than computing in
 *  JavaScript — a media query can then move all of them at once.
 */
const MARK = (fallback: number) => `var(--logo-size, ${fallback}px)`;

export function Logo({
  size = 38,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{
        // Read from CSS, with the prop as the fallback, so a breakpoint can
        // resize the whole mark without this file knowing about breakpoints.
        // The design draws it at 32px on the phone and 34px on the desktop.
        width: MARK(size),
        height: MARK(size),
        // The design file's own ratios, read off its 32px and 34px marks:
        // radius 7/32, stripe 4/32, glyph 14/32. Not rounded — at 34px the
        // stripe is 4.25px there, and rounding it to 4 drifts the phase.
        borderRadius: `calc(${MARK(size)} * 0.22)`,
        background:
          "repeating-linear-gradient(90deg, var(--color-green-600) 0 " +
          `calc(${MARK(size)} * 0.125), var(--color-green-700) ` +
          `calc(${MARK(size)} * 0.125) calc(${MARK(size)} * 0.25))`,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: `calc(${MARK(size)} * 0.4375)`,
        lineHeight: 1,
        color: "var(--color-grey-50)",
        flex: "none",
        userSelect: "none",
      }}
    >
      ΠΣ
    </span>
  );
}

/** The stacked wordmark — the lockup the handoff puts in every header.
 *
 *  ΠΑΜΕ above ΣΕΝΤΡΑ, then the halfway line with its centre spot, then
 *  "ΤΟΠΙΚΟ ΠΟΔΟΣΦΑΙΡΟ". The tagline is dropped below 40px, per the handoff:
 *  at header size it is three pixels tall and reads as a smudge.
 *
 *  The colours swap with the background and are not interchangeable. On navy,
 *  ΠΑΜΕ and the rule take green-400 — green-600 is 2.6:1 there and effectively
 *  invisible. On a light background they take green-600, because green-400 on
 *  white is 2.0:1. `on` says which.
 *
 *  Sized from one variable rather than fixed. The design draws the lockup at
 *  several sizes and every number inside moves by the same ratio, so there is
 *  one number to change and not six.
 */
export function Wordmark({
  size = 32,
  on = "navy",
}: {
  size?: number;
  /** Which background it is sitting on. */
  on?: "navy" | "light" | "grass";
}) {
  const accent =
    on === "navy"
      ? "var(--color-on-navy-accent)"
      : on === "grass"
        ? "#fff"
        : "var(--color-green-600)";
  const ink =
    on === "navy"
      ? // Not grey-100: that one goes dark with the theme, and ΣΕΝΤΡΑ
        // vanished into the navy bar.
        "var(--color-on-navy)"
      : on === "grass"
        ? "#fff"
        : "var(--color-heading)";

  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        // Everything below is a fraction of this, so one media query moves the
        // whole lockup.
        ["--lockup" as string]: MARK(size),
      }}
    >
      <span
        style={{
          font: "700 calc(var(--lockup) * 0.27)/1 var(--font-display)",
          letterSpacing: "calc(var(--lockup) * 0.1)",
          // The tracking pushes the word right by one gap; pulling it back
          // keeps it optically centred over ΣΕΝΤΡΑ.
          textIndent: "calc(var(--lockup) * 0.1)",
          color: accent,
        }}
      >
        ΠΑΜΕ
      </span>
      <span
        style={{
          font: "800 calc(var(--lockup) * 0.6)/.9 var(--font-display)",
          color: ink,
        }}
      >
        ΣΕΝΤΡΑ
      </span>
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "calc(var(--lockup) * 0.07)",
          marginTop: "calc(var(--lockup) * 0.07)",
        }}
      >
        <Rule accent={accent} />
        <span
          style={{
            width: "calc(var(--lockup) * 0.08)",
            height: "calc(var(--lockup) * 0.08)",
            borderRadius: "50%",
            background: accent,
            flex: "none",
          }}
        />
        <Rule accent={accent} />
      </span>
    </span>
  );
}

function Rule({ accent }: { accent: string }) {
  return (
    <span
      style={{
        flex: 1,
        height: "max(1px, calc(var(--lockup) * 0.05))",
        background: accent,
      }}
    />
  );
}
