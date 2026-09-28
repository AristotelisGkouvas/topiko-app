"use client";

import { useState } from "react";
import useSWR from "swr";

import { apiUrl, jsonFetcher } from "@/lib/api";
import { leagueLabel } from "@/lib/leagues";
import { SITE } from "@/lib/seo";
import type { League } from "@/lib/types";
import page from "./page.module.css";
import styles from "./WeeklyPack.module.css";

type Channel = "facebook" | "viber" | "instagram";

const CHANNELS: { id: Channel; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "viber", label: "Viber" },
  { id: "instagram", label: "Instagram" },
];

/** A link to the site that says, in the analytics, which post brought the
 *  reader: the channel as source, "social" as medium, the post as campaign. */
function tracked(path: string, channel: Channel, campaign: string): string {
  const url = new URL(path, SITE);
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

interface Post {
  day: string;
  title: string;
  images: { label: string; href: string }[];
  text: (channel: Channel) => string;
}

/** The same week, every week, ready to post: results on Monday, the vote and
 *  "on this day" on Thursday, the fixtures on Friday. The images are the
 *  site's own share cards; the words are written once here, per channel,
 *  with a link that says where its readers came from. */
export function WeeklyPack() {
  const { data: leagues } = useSWR<League[]>(apiUrl("/leagues"), jsonFetcher);
  const [chosen, setChosen] = useState<string | null>(null);

  if (!leagues) return <p className={page.loading}>Φόρτωση…</p>;
  const league = leagues.find((l) => l.slug === chosen) ?? leagues[0];
  if (!league) return <p>Δεν υπάρχει πρωτάθλημα για την τρέχουσα περίοδο.</p>;

  const label = `${leagueLabel(league)} ΕΠΣ Ηπείρου`;
  const played = league.current_matchday ?? 0;
  const next = league.total_matchdays !== null && played >= league.total_matchdays ? null : played + 1;
  const tag = (channel: Channel) => (channel === "instagram" ? "\n\n#ΕΠΣΗπείρου #τοπικόποδόσφαιρο #ΠάμεΣέντρα" : "");
  const link = (channel: Channel, path: string, campaign: string) =>
    channel === "instagram" ? "Όλα τα σκορ: link στο προφίλ." : tracked(path, channel, campaign);

  const posts: Post[] = [];
  if (played > 0) {
    posts.push({
      day: "Δευτέρα",
      title: `Αποτελέσματα ${played}ης αγωνιστικής`,
      images: [
        { label: "Κάρτα αποτελεσμάτων", href: `/agones/karta?liga=${league.slug}&agonistiki=${played}` },
        { label: "Βαθμολογία", href: `/vathmologia/karta?liga=${league.slug}` },
      ],
      text: (c) =>
        `Τα αποτελέσματα της ${played}ης αγωνιστικής, ${label}. Σκόρερ, κάρτες και η βαθμολογία:\n` +
        link(c, `/agones?liga=${league.slug}&agonistiki=${played}`, `apotelesmata-${league.slug}-${played}`) +
        tag(c),
    });
  }
  posts.push({
    day: "Πέμπτη",
    title: "Παίκτης αγωνιστικής και «Σαν σήμερα»",
    images: [],
    text: (c) =>
      `Ποιος ήταν ο καλύτερος της αγωνιστικής; Ψηφίστε τον παίκτη της εβδομάδας, ${label}:\n` +
      link(c, "/mvp", `mvp-${league.slug}-${played}`) +
      (c === "instagram" ? "" : `\n\nΚαι σαν σήμερα, τα παλιά αποτελέσματα: ${tracked("/san-simera", c, "san-simera")}`) +
      tag(c),
  });
  if (next !== null) {
    posts.push({
      day: "Παρασκευή",
      title: `Πρόγραμμα ${next}ης αγωνιστικής`,
      images: [{ label: "Κάρτα προγράμματος", href: `/agones/karta?liga=${league.slug}&agonistiki=${next}` }],
      text: (c) =>
        `Το πρόγραμμα της ${next}ης αγωνιστικής, ${label}. Ώρες, γήπεδα και live σκορ την Κυριακή:\n` +
        link(c, `/agones?liga=${league.slug}&agonistiki=${next}`, `programma-${league.slug}-${next}`) +
        tag(c),
    });
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Έτοιμες αναρτήσεις για κάθε εβδομάδα: άνοιξε την εικόνα, αντέγραψε το κείμενο του καναλιού,
        ανέβασέ τα. Τα links λένε στα στατιστικά από ποια ανάρτηση ήρθε ο κόσμος.
      </p>
      <label className={styles.pick}>
        Κατηγορία
        <select className={page.input} value={league.slug} onChange={(e) => setChosen(e.target.value)}>
          {leagues.map((l) => (
            <option key={l.slug} value={l.slug}>
              {leagueLabel(l)}
            </option>
          ))}
        </select>
      </label>
      <ol className={styles.posts}>
        {posts.map((post) => (
          <li key={post.day} className={styles.post}>
            <p className={styles.day}>{post.day}</p>
            <h3 className={styles.title}>{post.title}</h3>
            {post.images.length > 0 && (
              <p className={styles.images}>
                {post.images.map((img) => (
                  <a key={img.href} href={img.href} target="_blank" rel="noopener noreferrer">
                    {img.label} ↗
                  </a>
                ))}
              </p>
            )}
            <div className={styles.channels}>
              {CHANNELS.map((c) => (
                <CopyText key={c.id} label={c.label} text={post.text(c.id)} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Copies one channel's text; if the clipboard is refused, shows it to copy
 *  by hand. */
function CopyText({ label, text }: { label: string; text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "shown">("idle");
  return (
    <div className={styles.copy}>
      <button
        type="button"
        className={page.save}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
            setTimeout(() => setState("idle"), 1800);
          } catch {
            setState("shown");
          }
        }}
      >
        {state === "copied" ? "Αντιγράφηκε" : `Κείμενο για ${label}`}
      </button>
      {state === "shown" && (
        <textarea className={page.input} readOnly value={text} rows={4} onFocus={(e) => e.currentTarget.select()} />
      )}
    </div>
  );
}
