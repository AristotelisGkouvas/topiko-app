"use client";

import { useFavourite } from "@/lib/favourite";
import styles from "./FollowButton.module.css";

/** The ☆ from the team profile header in the kit.
 *
 *  Following is kept in this browser and nowhere else: there are no accounts
 *  for readers, and asking someone to register before they can mark their
 *  village team would cost more than the feature is worth.
 */
export function FollowButton({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const { toggle, following } = useFavourite();
  const isFollowing = following(slug);

  return (
    <button
      type="button"
      className={`${styles.button} ${isFollowing ? styles.on : ""}`}
      onClick={() => toggle({ slug, name })}
      // The label carries the state, because the only visual difference is a
      // filled star against an outlined one.
      aria-pressed={isFollowing}
      aria-label={
        isFollowing
          ? `Το ${name} είναι η ομάδα σου. Κατάργηση.`
          : `Όρισε το ${name} ως ομάδα σου`
      }
      title={isFollowing ? "Η ομάδα σου" : "Όρισε ως ομάδα σου"}
    >
      <span aria-hidden="true">{isFollowing ? "★" : "☆"}</span>
    </button>
  );
}
