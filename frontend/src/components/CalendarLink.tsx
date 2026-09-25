"use client";

import { useState } from "react";

import { calendarUrl } from "@/lib/api";
import { NotifyButton } from "./NotifyButton";
import styles from "./CalendarLink.module.css";
import { Icon } from "@/components/Icon";

/** Subscribe to a club's fixtures.
 *
 *  Two routes on purpose. `webcal:` is what iOS and Outlook open directly into
 *  a subscription, which is the version that keeps updating. Google Calendar
 *  on Android does not take it, and wants the https URL pasted into "Add by
 *  URL" — so the address is shown and copyable rather than hidden behind the
 *  button.
 *
 *  Folded to one line until asked for: the whole box, open, was the largest
 *  thing on a club page after the fixtures, for something most readers never
 *  use. The notifications button stays out, where it is seen.
 */
export function CalendarLink({ slug, name }: { slug: string; name: string }) {
  const https = calendarUrl(slug);
  const webcal = https.replace(/^https?:/, "webcal:");
  const [copied, setCopied] = useState(false);

  return (
    <section className={styles.box}>
      <details className={styles.fold}>
        <summary className={styles.head}>
          <span className={styles.glyph} aria-hidden="true">
            <Icon name="calendar" size={18} />
          </span>
          <span className={styles.title}>Πρόγραμμα στο ημερολόγιό σου</span>
          <span className={styles.caret} aria-hidden="true">
            ▾
          </span>
        </summary>
        <p className={styles.sub}>
          Οι αγώνες του {name} ενημερώνονται μόνοι τους, και οι αναβολές.
        </p>

        <div className={styles.actions}>
          <a className={styles.subscribe} href={webcal}>
            Εγγραφή
          </a>
          <button
            type="button"
            className={styles.copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(https);
                setCopied(true);
                // Reset without state-in-effect: the timer is started by the
                // click, not by rendering.
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // Clipboard blocked, or an insecure origin. The address is on
                // the page either way.
                setCopied(false);
              }
            }}
          >
            {copied ? "Αντιγράφηκε" : "Αντιγραφή διεύθυνσης"}
          </button>
        </div>

        <p className={styles.hint}>
          Στο Google Calendar: «Άλλα ημερολόγια» → «Από URL» και επικόλληση.
        </p>
      </details>

      <NotifyButton slug={slug} name={name} />
    </section>
  );
}
