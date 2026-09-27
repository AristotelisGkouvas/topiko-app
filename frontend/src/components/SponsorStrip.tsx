import type { CSSProperties } from "react";

import { MarqueePause } from "@/components/MarqueePause";
import { SponsorSeen } from "@/components/SponsorSeen";
import { sponsorHref } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import styles from "./SponsorStrip.module.css";

/** Past this many, the row no longer fits a phone and starts to scroll by
 *  itself; up to it, the plates stand still in the middle. A marquee of two
 *  logos chasing each other round is worse than two logos. */
const STILL_UP_TO = 3;

interface StripSponsor {
  id: number;
  name: string;
  logo_url?: string | null;
  website_url?: string | null;
}

interface Plate {
  key: string;
  kind: "platform" | "club";
  id: number;
  name: string;
  logo: string | null;
  href: string | null;
}

/** A row of small sponsor logos that scrolls by itself when there are more
 *  than fit — under the score on a match page (the two clubs' sponsors,
 *  taking turns), and at the foot of every page (the platform's).
 *
 *  It moves sideways rather than growing, so ten cost the page no more height
 *  than two, and every one of them comes past. Each view and click is
 *  counted, for the sponsor's renewal.
 */
export async function SponsorStrip({
  sponsors,
  kind,
  label,
}: {
  sponsors: StripSponsor[];
  kind: "platform" | "club";
  /** A caption before the logos, e.g. "Μεγάλοι χορηγοί". */
  label?: string;
}) {
  if (sponsors.length === 0) return null;
  const plates: Plate[] = await Promise.all(
    sponsors.map(async (s) => ({
      key: `${kind}-${s.id}`,
      kind,
      id: s.id,
      name: s.name,
      logo: mediaUrl(s.logo_url),
      href: s.website_url ? await sponsorHref(kind, s.id) : null,
    })),
  );
  const moving = plates.length > STILL_UP_TO;
  const ids = plates.map((p) => p.id);

  return (
    <section
      className={`${styles.strip} ${moving ? styles.moving : ""}`}
      aria-label={label ?? "Χορηγοί"}
      // Same speed whatever the count: about 2.5 seconds a sponsor.
      style={{ "--loop": `${plates.length * 2.5}s` } as CSSProperties}
    >
      {label && <p className={styles.label}>{label}</p>}
      {moving && (
        <div className={styles.controls}>
          <MarqueePause />
        </div>
      )}
      <SponsorSeen
        className={styles.window}
        platform={kind === "platform" ? ids : []}
        club={kind === "club" ? ids : []}
      >
        <div className={styles.track}>
          <Plates plates={plates} />
          {/* The second copy is what makes the loop seamless: when the first
              has scrolled fully out, the second stands exactly where it began.
              Hidden from screen readers and the tab order — it is decoration. */}
          {moving && <Plates plates={plates} copy />}
        </div>
      </SponsorSeen>
    </section>
  );
}

/** [h1, a1, h2, a2, …], then whatever the longer list has left. Home first,
 *  as on the scoreboard. */
export function alternate<T>(home: T[], away: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(home.length, away.length); i++) {
    if (i < home.length) out.push(home[i]);
    if (i < away.length) out.push(away[i]);
  }
  return out;
}

function Plates({ plates, copy = false }: { plates: Plate[]; copy?: boolean }) {
  return (
    <ul className={styles.row} aria-hidden={copy || undefined}>
      {plates.map((plate) => {
        const body = plate.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
          <img className={styles.logo} src={plate.logo} alt={copy ? "" : plate.name} decoding="async" />
        ) : (
          // No logo: the name itself, set like one, rather than an empty box.
          <span className={styles.word}>{plate.name}</span>
        );
        return (
          <li key={plate.key} className={styles.cell}>
            {plate.href ? (
              <a
                className={styles.plate}
                href={plate.href}
                target="_blank"
                rel="sponsored noopener"
                title={plate.name}
                tabIndex={copy ? -1 : undefined}
              >
                {body}
              </a>
            ) : (
              <span className={styles.plate} title={plate.name}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
