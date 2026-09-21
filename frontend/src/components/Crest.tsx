import { upper } from "@/lib/format";
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
  // Greek-aware, or a club whose name opens with an accent is badged
  // "ΉΠ" — the tonos survives a plain toUpperCase.
  const label = team.initials ?? upper(team.name.slice(0, 2));
  return (
    <span className={`${styles.crest} ${styles[size]}`} aria-hidden="true">
      {label}
    </span>
  );
}
