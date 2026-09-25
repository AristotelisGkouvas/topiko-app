import styles from "@/styles/primitives.module.css";

/** Green "Ενεργό" or red "Ανενεργό" — whether a club or player appears in this
 *  season or the last. Renders nothing when the API could not say (null). */
export function ActivityStatus({
  active,
  masculine = false,
}: {
  active: boolean | null | undefined;
  /** "Ενεργός" for a player rather than "Ενεργό" for a club. */
  masculine?: boolean;
}) {
  if (active == null) return null;
  const word = active ? "Ενεργ" : "Ανενεργ";
  return (
    <span
      className={active ? styles.statusActive : styles.statusInactive}
      title={active ? "Αγωνίστηκε φέτος ή πέρσι" : "Δεν αγωνίστηκε ούτε φέτος ούτε πέρσι"}
    >
      {word}
      {masculine ? "ός" : "ό"}
    </span>
  );
}
