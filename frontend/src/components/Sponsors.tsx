import { mediaUrl } from "@/lib/media";
import type { Sponsor } from "@/lib/types";
import styles from "./Sponsors.module.css";

/** A club's sponsors: logo and name, linked when there is a site.
 *
 *  rel="sponsored" because they are paid placements, which is what search
 *  engines ask to be told; noopener because the link leaves the site.
 */
export function Sponsors({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <ul className={styles.list}>
      {sponsors.map((sponsor) => {
        const logo = mediaUrl(sponsor.logo_url);
        const body = (
          <>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
              <img className={styles.logo} src={logo} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className={styles.placeholder} aria-hidden="true" />
            )}
            <span className={styles.name}>{sponsor.name}</span>
          </>
        );
        return (
          <li key={sponsor.id}>
            {sponsor.website_url ? (
              <a
                className={styles.item}
                href={sponsor.website_url}
                target="_blank"
                rel="sponsored noopener noreferrer"
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
  );
}
