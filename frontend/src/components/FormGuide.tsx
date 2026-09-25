import styles from "./FormGuide.module.css";

type Result = "Ν" | "Ι" | "Η";

const WORD: Record<Result, string> = { Ν: "νίκη", Ι: "ισοπαλία", Η: "ήττα" };
const CLASS: Record<Result, string> = { Ν: "win", Ι: "draw", Η: "loss" };

/** A club's last results, the same way everywhere.
 *
 *  Two sizes of one thing, where there used to be three drawings of it:
 *  - `mark` for dense rows (the table, the home page's top five): a win is a
 *    filled disc, a draw a ring, a loss a filled square. The shapes carry the
 *    result on their own, so it survives red–green colour blindness — the
 *    green and the brick are only 1.3:1 apart in lightness.
 *  - `letter` where there is room (a club's own page): the Ν / Ι / Η pill.
 *
 *  Either way it is one image to a screen reader, read out in words. */
export function FormGuide({
  form,
  variant = "mark",
}: {
  /** Oldest first, as the API sends it: "ΝΝΙΗΝ". */
  form: string | string[];
  variant?: "mark" | "letter";
}) {
  const results = (Array.isArray(form) ? form : form.split("")).filter(
    (r): r is Result => r === "Ν" || r === "Ι" || r === "Η",
  );
  if (results.length === 0) return null;

  return (
    <span
      className={`${styles.form} ${styles[variant]}`}
      role="img"
      aria-label={`Φόρμα: ${results.map((r) => WORD[r]).join(", ")}`}
    >
      {results.map((r, i) => (
        <span
          key={i}
          className={`${styles.item} ${styles[CLASS[r]]}`}
          aria-hidden="true"
        >
          {variant === "letter" ? r : null}
        </span>
      ))}
    </span>
  );
}
