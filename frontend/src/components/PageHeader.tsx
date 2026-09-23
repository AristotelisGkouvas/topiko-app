import styles from "./PageHeader.module.css";

/** The navy bar every subpage carries in the design file.
 *
 *  The site used to put page titles in the content area, in navy ink on the
 *  grey canvas. The design puts them *in* the navy: the coloured band is taller
 *  on a subpage than on the home screen and holds the title, the season, and
 *  whatever control the page is steered by — a matchday stepper, a division
 *  picker. Read off screen E2: padding 16px 16px 14px, gap 12px, title Fira
 *  800 24px in grey-100, aside Noto 600 11.5px in the muted on-navy blue.
 *
 *  `controls` is the second row, which the design draws as a filled navy-700
 *  slot at radius 10. Pages with nothing to steer pass nothing and get a
 *  one-row header.
 */
export function PageHeader({
  title,
  aside,
  controls,
}: {
  title: string;
  /** Top right — the season, a count, a status. Never a control. */
  aside?: React.ReactNode;
  /** The second row. Use `PageHeaderStepper` for the ‹ · › shape. */
  controls?: React.ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <h1 className={styles.title}>{title}</h1>
          {aside && <span className={styles.aside}>{aside}</span>}
        </div>
        {controls && <div className={styles.controls}>{controls}</div>}
      </div>
    </header>
  );
}

/** The design's stepper: ‹ label › inside the filled slot, arrows in the muted
 *  blue so the label is what the eye lands on. */
export function PageHeaderStepper({
  label,
  previous,
  next,
}: {
  label: React.ReactNode;
  previous?: { href: string; label: string };
  next?: { href: string; label: string };
}) {
  return (
    <div className={styles.stepper}>
      {previous ? (
        <a className={styles.arrow} href={previous.href} aria-label={previous.label}>
          ‹
        </a>
      ) : (
        <span className={styles.arrowOff} aria-hidden="true">
          ‹
        </span>
      )}
      <span className={styles.stepperLabel}>{label}</span>
      {next ? (
        <a className={styles.arrow} href={next.href} aria-label={next.label}>
          ›
        </a>
      ) : (
        <span className={styles.arrowOff} aria-hidden="true">
          ›
        </span>
      )}
    </div>
  );
}
