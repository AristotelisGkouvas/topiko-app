import styles from "./page.module.css";

/** The design's three pills, with the current one stretched.
 *
 *  Not numbered circles: the numbers invited the reader to count how much was
 *  left, and three is already the answer to that. A stretched pill says "here"
 *  without saying "two more to go".
 */
export function Steps({ at }: { at: 1 | 2 | 3 }) {
  return (
    <div className={styles.dots} role="group" aria-label={`Βήμα ${at} από 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`${styles.dot} ${n === at ? styles.dotOn : ""}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
