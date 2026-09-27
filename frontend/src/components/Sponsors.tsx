import { SponsorSeen } from "@/components/SponsorSeen";
import { sponsorHref } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import type { Sponsor } from "@/lib/types";
import styles from "./Sponsors.module.css";

/** A club's sponsors: logo and name, linked when there is a site.
 *
 *  rel="sponsored" because they are paid placements, which is what search
 *  engines ask to be told; noopener because the link leaves the site.
 */
export async function Sponsors({ sponsors }: { sponsors: Sponsor[] }) {
  // Through the API's redirect, which counts the click for the club's
  // renewal conversation.
  const hrefs = await Promise.all(
    sponsors.map((s) => (s.website_url ? sponsorHref("club", s.id) : null)),
  );
  return (
    <SponsorSeen club={sponsors.map((s) => s.id)}>
      <ul className={styles.list}>
        {sponsors.map((sponsor, index) => {
          const logo = mediaUrl(sponsor.logo_url);
          const body = (
            <>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
                <img className={styles.logo} src={logo} alt="" loading="lazy" decoding="async" />
              ) : (
                // No logo yet: the name's initials on the plate, not an empty
                // grey box that reads as an image that failed to load.
                <span className={styles.placeholder} aria-hidden="true">
                  {initials(sponsor.name)}
                </span>
              )}
              <span className={styles.name}>{sponsor.name}</span>
            </>
          );
          return (
            <li key={sponsor.id}>
              {hrefs[index] ? (
                <a
                  className={styles.item}
                  href={hrefs[index]!}
                  target="_blank"
                  rel="sponsored noopener"
                >
                  {body}
                </a>
              ) : (
                <span className={styles.item}>{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </SponsorSeen>
  );
}

/** "Σούπερ Μάρκετ Γιάννενα" → "ΣΜΓ": up to three first letters. */
function initials(name: string): string {
  return name
    .split(/[\s.\-]+/)
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toLocaleUpperCase("el-GR");
}
