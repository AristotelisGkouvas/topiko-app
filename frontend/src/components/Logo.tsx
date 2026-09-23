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

/** The wordmark as it sits on the navy bar: ΠΑΜΕ in the on-navy green above
 *  ΣΕΝΤΡΑ in off-white. green-600 all but vanishes against navy, which is why
 *  the palette keeps a lighter one for exactly this.
 *
 *  Sized from the mark beside it rather than fixed. The design file draws the
 *  pair twice — 32px on the phone and 34px on the desktop — and every number
 *  in the wordmark moves by the same 34/32: 8.64→9.18, 19.2→20.4, 3.2→3.4.
 *  So there is one ratio, not two sets of pixels to keep in step.
 */
export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span
        style={{
          font: `700 calc(${MARK(size)} * 0.27)/1 var(--font-display)`,
          letterSpacing: `calc(${MARK(size)} * 0.1)`,
          color: "var(--color-on-navy-accent)",
        }}
      >
        ΠΑΜΕ
      </span>
      <span
        style={{
          font: `800 calc(${MARK(size)} * 0.6)/.9 var(--font-display)`,
          color: "var(--color-grey-100)",
        }}
      >
        ΣΕΝΤΡΑ
      </span>
    </span>
  );
}
