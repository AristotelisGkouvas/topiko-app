"use client";

import styles from "./page.module.css";

/** The design's 42×24 switch.
 *
 *  A real checkbox underneath, visually hidden. A div with an onClick is not
 *  reachable by keyboard, is not announced as a switch, and cannot be toggled
 *  by a screen reader's own controls — and this screen is the one place a
 *  reader goes to *stop* being interrupted, which is exactly when a broken
 *  control is least forgivable.
 */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        className={styles.toggleInput}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </label>
  );
}
