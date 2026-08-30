import type { TeamRef } from "@/lib/types";
import styles from "./Crest.module.css";

/** Placeholder crest: the club monogram on a tinted square.
 *  Real logos drop in later behind the same box, so nothing else moves. */
export function Crest({
  team,
  size = "md",
}: {
  team: TeamRef;
  size?: "sm" | "md" | "lg";
}) {
  const label = team.initials ?? team.name.slice(0, 2).toUpperCase();
  return (
    <span className={`${styles.crest} ${styles[size]}`} aria-hidden="true">
      {label}
    </span>
  );
}
