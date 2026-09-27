import { SponsorSeen } from "@/components/SponsorSeen";
import { api, sponsorHref } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import styles from "./HomeSponsor.module.css";

/** Days since 1970 on the Greek calendar: the same number all day, the next
 *  one from midnight in Ioannina — not from 03:00, when UTC gets there. */
function today(): number {
  const athens = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(Date.now());
  return Math.floor(Date.parse(athens) / 86_400_000);
}

/** The home page's sponsor banner: one sponsor, big.
 *
 *  With several home-page sponsors they take a day each, in their order —
 *  the same one all day, so a reader coming back at half time sees the
 *  sponsor they saw before kickoff.
 */
export async function HomeSponsor() {
  const sponsors = await api.listPlatformSponsors("home").catch(() => []);
  if (sponsors.length === 0) return null;
  const sponsor = sponsors[today() % sponsors.length];
  const logo = mediaUrl(sponsor.logo_url);
  const href = sponsor.website_url ? await sponsorHref("platform", sponsor.id) : null;

  const body = (
    <>
      <span className={styles.plate}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
          <img className={styles.logo} src={logo} alt="" />
        ) : (
          <span className={styles.word}>{sponsor.name}</span>
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.kicker}>Μεγάλος χορηγός</span>
        <span className={styles.name}>{sponsor.name}</span>
      </span>
      {href && (
        <span className={styles.go} aria-hidden="true">
          ›
        </span>
      )}
    </>
  );

  return (
    <SponsorSeen platform={[sponsor.id]} className={styles.wrap}>
      {href ? (
        <a className={styles.card} href={href} target="_blank" rel="sponsored noopener">
          {body}
        </a>
      ) : (
        <div className={styles.card}>{body}</div>
      )}
    </SponsorSeen>
  );
}
