"use client";

import { useState } from "react";

import { calendarUrl } from "@/lib/api";
import { FollowButton } from "./FollowButton";
import { Icon } from "./Icon";
import { NotifyButton } from "./NotifyButton";
import { ShareButton } from "./ShareButton";
import styles from "./ClubActions.module.css";

/** What a supporter does on a club's page, as one row (screen 06).
 *
 *  Four actions, one shape: follow, notifications, calendar, share. They used
 *  to be a star pill, an outlined button, and a card holding a dropdown with
 *  a third button inside it: three styles for four things, and the calendar
 *  box was the biggest thing in the hero for the action used least. Anything
 *  an action needs to say (the calendar's address, a blocked permission)
 *  opens under the row, full width.
 */
export function ClubActions({
  slug,
  name,
  shareTitle,
}: {
  slug: string;
  name: string;
  shareTitle: string;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <div className={styles.actions}>
      <FollowButton slug={slug} name={name} className={styles.follow} />
      <NotifyButton slug={slug} name={name} compact buttonClassName={styles.action} />
      <button
        type="button"
        className={styles.action}
        aria-expanded={calendarOpen}
        aria-controls="club-calendar"
        onClick={() => setCalendarOpen((open) => !open)}
      >
        <Icon name="calendar" size={16} />
        Ημερολόγιο
      </button>
      {/* The card this shares is the club's own OG image, which already
          carries the crest and the standing — so the link arrives in a
          group chat looking like something rather than like a URL. */}
      <ShareButton title={shareTitle} className={styles.action} />

      {calendarOpen && <CalendarPanel slug={slug} name={name} />}
    </div>
  );
}

/** Subscribe to a club's fixtures.
 *
 *  Two routes on purpose. `webcal:` is what iOS and Outlook open directly into
 *  a subscription, which is the version that keeps updating. Google Calendar
 *  on Android does not take it, and wants the https URL pasted into "Add by
 *  URL" — so the address is offered to copy rather than hidden behind the
 *  button. */
function CalendarPanel({ slug, name }: { slug: string; name: string }) {
  const https = calendarUrl(slug);
  const webcal = https.replace(/^https?:/, "webcal:");
  const [copied, setCopied] = useState(false);

  return (
    <div id="club-calendar" className={styles.panel}>
      <p className={styles.panelText}>
        Οι αγώνες του {name} στο ημερολόγιό σου. Ενημερώνονται μόνοι τους, και
        οι αναβολές.
      </p>
      <div className={styles.panelButtons}>
        <a
          className={styles.subscribe}
          href={webcal}
          data-track="calendar"
          data-track-props={JSON.stringify({ how: "subscribe" })}
        >
          Εγγραφή
        </a>
        <button
          type="button"
          className={styles.action}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(https);
              setCopied(true);
              // Reset without state-in-effect: the timer is started by the
              // click, not by rendering.
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard blocked, or an insecure origin. The hint below
              // still says where to paste it from.
              setCopied(false);
            }
          }}
        >
          {copied ? "Αντιγράφηκε" : "Αντιγραφή διεύθυνσης"}
        </button>
      </div>
      <p className={styles.panelHint}>
        Στο Google Calendar: «Άλλα ημερολόγια» → «Από URL» και επικόλληση.
      </p>
    </div>
  );
}
