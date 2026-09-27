import styles from "./FormGuide.module.css";

type Result = "Ν" | "Ι" | "Η";

const WORD: Record<Result, string> = { Ν: "νίκη", Ι: "ισοπαλία", Η: "ήττα" };
const CLASS: Record<Result, string> = { Ν: "win", Ι: "draw", Η: "loss" };

/** A club's last results, the same way everywhere.
 *
 *  Two sizes of one thing, where there used to be three drawings of it:
 *  - `mark` for dense rows (the table, the home page's top five): three round
 *    dots, green / yellow / red. All one shape, so for red–green colour
 *    blindness a win and a loss differ by lightness (a light green, a dark
 *    red — --color-form-* in tokens.css) and by the legend's words.
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
