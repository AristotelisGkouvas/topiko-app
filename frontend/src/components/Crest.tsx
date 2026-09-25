import { upper } from "@/lib/format";
import { inkOn, mediaUrl } from "@/lib/media";
import type { CrestSubject } from "@/lib/types";
import styles from "./Crest.module.css";

/** A club's badge: its logo when the federation has uploaded one, otherwise
 *  the monogram on a disc — in the club's own colour when it has one, in the
 *  site's green when it does not. Same box either way, so nothing around it
 *  moves when a logo arrives. */
export function Crest({
  team,
  size = "md",
  onNavy = false,
}: {
  team: CrestSubject;
  size?: "xs" | "sm" | "md" | "lg";
  /** Inverts the disc for use on the navy bar, where green vanishes. */
  onNavy?: boolean;
}) {
  const logo = mediaUrl(team.logo_url);
  if (logo) {
    return (
      <span className={`${styles.crest} ${styles.logo} ${styles[size]}`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- already a
            small WebP from the API; the optimiser would only re-encode it. */}
        <img src={logo} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }

  // Greek-aware, or a club whose name opens with an accent is badged
  // "ΉΠ" — the tonos survives a plain toUpperCase.
  const label = team.initials ?? upper(team.name.slice(0, 2));
  const colour = team.primary_color;
  return (
    <span
      className={`${styles.crest} ${styles[size]} ${
        onNavy && !colour ? styles.onNavy : ""
      } ${onNavy && colour ? styles.ringed : ""}`}
      style={colour ? { background: colour, color: inkOn(colour) } : undefined}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
