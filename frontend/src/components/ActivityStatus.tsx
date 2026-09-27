import styles from "@/styles/primitives.module.css";

/** Green "Ενεργό" or red "Ανενεργό" on a club or a player. Renders nothing
 *  when the API could not say (null) — for players that is the usual case, as
 *  the API only ever knows that one is active, never that one is not. */
export function ActivityStatus({
  active,
  masculine = false,
}: {
  active: boolean | null | undefined;
  /** A player ("Ενεργός") rather than a club ("Ενεργό"). */
  masculine?: boolean;
}) {
  if (active == null) return null;
  const title = masculine
    ? "Στις λίστες της ένωσης φέτος ή πέρσι"
    : active
      ? "Συμμετέχει σε πρωτάθλημα φέτος"
      : "Δεν συμμετέχει σε πρωτάθλημα φέτος";
  return (
    <span
      className={active ? styles.statusActive : styles.statusInactive}
      title={title}
    >
      {active ? "Ενεργ" : "Ανενεργ"}
      {masculine ? "ός" : "ό"}
    </span>
  );
}
