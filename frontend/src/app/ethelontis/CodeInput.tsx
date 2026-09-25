"use client";

import { useId, useRef } from "react";

import styles from "./page.module.css";

/** The code field from screen V1: one box per character, drawn large.
 *
 *  Reading ΠΙΝ-482719 off a card and typing it into a single narrow field is
 *  where people lose their place — the boxes are what let them check the third
 *  character against the paper without counting.
 *
 *  Implemented as one real `<input>` lying invisibly over the boxes rather than
 *  as nine inputs. Nine would each need their own focus juggling, would break
 *  paste, and would read to a screen reader as nine unlabelled fields; this is
 *  one field with a decorative rendering, which is what it actually is.
 */
export function CodeInput({
  value,
  onChange,
  letters = 3,
  digits = 6,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** How many characters before the dash, and how many after. */
  letters?: number;
  digits?: number;
  invalid?: boolean;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);

  // The dash is drawn, not stored: the reader may or may not type it, and the
  // server forgives either way. What is stored is what they typed.
  const clean = value.replace(/[-‐-―−\s]/g, "");
  // Most prefixes are three letters, but a club that collided with another
  // gets ΚΟΝΙ or ΚΟΝ2. Whatever precedes the last six characters is the
  // prefix, so the boxes grow with it instead of pushing a letter past the dash.
  const lead = Math.max(letters, Math.min(5, clean.length - digits));
  const boxes = [
    ...Array.from({ length: lead }, (_, i) => clean[i] ?? ""),
    null, // the dash
    ...Array.from({ length: digits }, (_, i) => clean[lead + i] ?? ""),
  ];

  return (
    <div className={styles.codeWrap}>
      <label className={styles.codeLabel} htmlFor={id}>
        Κωδικός σωματείου
      </label>

      <div
        className={styles.code}
        // Clicking anywhere on the boxes focuses the field behind them.
        onClick={() => field.current?.focus()}
      >
        {boxes.map((char, i) =>
          char === null ? (
            <span key="dash" className={styles.codeDash} aria-hidden="true">
              –
            </span>
          ) : (
            <span
              key={i}
              className={`${styles.codeBox} ${char ? styles.codeBoxFull : ""} ${
                invalid ? styles.codeBoxBad : ""
              }`}
              aria-hidden="true"
            >
              {char}
            </span>
          ),
        )}

        <input
          ref={field}
          id={id}
          className={styles.codeField}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // The code is letters and digits. A keyboard that capitalises only
          // the first letter, or autocorrects ΠΙΝ into Πιν, produces a code
          // rejected for no visible reason.
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          maxLength={5 + digits + 2}
          aria-invalid={invalid || undefined}
          required
        />
      </div>
    </div>
  );
}
