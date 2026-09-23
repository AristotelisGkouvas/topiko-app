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
        width: size,
        height: size,
        // A quarter of the mark, so the stripe count holds as it scales.
        borderRadius: Math.round(size * 0.21),
        background:
          "repeating-linear-gradient(90deg, var(--color-green-600) 0 " +
          `${Math.max(3, Math.round(size * 0.21))}px, var(--color-green-700) ` +
          `${Math.max(3, Math.round(size * 0.21))}px ${Math.max(6, Math.round(size * 0.42))}px)`,
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: Math.round(size * 0.42),
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
 *  the palette keeps a lighter one for exactly this. */
export function Wordmark() {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        style={{
          font: "700 10px/1 var(--font-display)",
          letterSpacing: "4px",
          color: "var(--color-on-navy-accent)",
        }}
      >
        ΠΑΜΕ
      </span>
      <span
        style={{
          font: "800 22px/.85 var(--font-display)",
          color: "var(--color-grey-100)",
        }}
      >
        ΣΕΝΤΡΑ
      </span>
    </span>
  );
}
