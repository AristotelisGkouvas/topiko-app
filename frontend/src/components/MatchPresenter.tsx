import { SponsorSeen } from "@/components/SponsorSeen";
import { sponsorHref } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import type { PlatformSponsor } from "@/lib/types";
import styles from "./MatchPresenter.module.css";

/** "Ο αγώνας με την υποστήριξη του …" — a platform sponsor over the score.
 *
 *  One per match. With several match sponsors, each match gets one of them
 *  by its id, so they share the fixtures evenly and a given match always
 *  names the same one — a reader who comes back does not see it change.
 */
export async function MatchPresenter({
  sponsors,
  matchId,
}: {
  sponsors: PlatformSponsor[];
  matchId: number;
}) {
  if (sponsors.length === 0) return null;
  const sponsor = sponsors[matchId % sponsors.length];
  const logo = mediaUrl(sponsor.logo_url);
  const href = sponsor.website_url ? await sponsorHref("platform", sponsor.id) : null;
  const body = (
    <>
      <span className={styles.lead}>Με την υποστήριξη</span>
      <span className={styles.plate}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small WebP from the API
          <img className={styles.logo} src={logo} alt={sponsor.name} />
        ) : (
          <span className={styles.word}>{sponsor.name}</span>
        )}
      </span>
    </>
  );

  return (
    <SponsorSeen platform={[sponsor.id]} className={styles.wrap}>
      {href ? (
        <a className={styles.link} href={href} target="_blank" rel="sponsored noopener">
          {body}
        </a>
      ) : (
        <span className={styles.link}>{body}</span>
      )}
    </SponsorSeen>
  );
}
