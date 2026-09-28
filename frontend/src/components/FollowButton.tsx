"use client";

import { track } from "@/lib/analytics";
import { useFavourite } from "@/lib/favourite";
import styles from "./FollowButton.module.css";
import { Icon } from "@/components/Icon";

/** "Ακολουθώ", the club page's first action (screen 06).
 *
 *  Green and filled until pressed, because it is the one thing the page asks
 *  of a visitor; afterwards it goes quiet and says so, with the filled star.
 *  Following is kept in this browser and nowhere else: there are no accounts
 *  for readers, and asking someone to register before they can mark their
 *  village team would cost more than the feature is worth.
 */
export function FollowButton({
  slug,
  name,
  className = "",
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  const { toggle, following } = useFavourite();
  const isFollowing = following(slug);

  return (
    <button
      type="button"
      className={`${styles.button} ${isFollowing ? styles.on : ""} ${className}`}
      onClick={() => {
        track(isFollowing ? "unfollow" : "follow", { team: slug });
        toggle({ slug, name });
      }}
      // The pressed state is what a screen reader announces; the words
      // start with what is on screen, so voice control finds it (WCAG 2.5.3).
      aria-pressed={isFollowing}
      aria-label={isFollowing ? `Ακολουθείς: ${name}` : `Ακολουθώ: ${name}`}
    >
      <Icon name="star" size={16} filled={isFollowing} />
      {isFollowing ? "Ακολουθείς" : "Ακολουθώ"}
    </button>
  );
}
