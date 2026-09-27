"use client";

import { useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { editorApi, type AuditEntry } from "@/lib/editorApi";
import styles from "./page.module.css";

const ACTIONS: Record<string, string> = {
  "match.edit": "Αγώνας",
  "match.event": "Γεγονός αγώνα",
  "field.edit": "Γήπεδο",
  "club_code.issue": "Νέος κωδικός σωματείου",
  "club_code.revoke": "Ακύρωση κωδικού σωματείου",
  "mvp.open": "Ψηφοφορία MVP",
  "mvp.close": "Κλείσιμο ψηφοφορίας MVP",
  "mvp.remove": "Διαγραφή ψηφοφορίας MVP",
  "team.colours": "Χρώματα σωματείου",
  "team.logo": "Σήμα σωματείου",
  "team.logo_remove": "Αφαίρεση σήματος",
  "photo.add": "Νέα φωτογραφία",
  "photo.edit": "Λεζάντα φωτογραφίας",
  "photo.remove": "Διαγραφή φωτογραφίας",
  "sponsor.add": "Νέος χορηγός σωματείου",
  "sponsor.edit": "Χορηγός σωματείου",
  "sponsor.logo": "Λογότυπο χορηγού σωματείου",
  "sponsor.remove": "Διαγραφή χορηγού σωματείου",
  "platform_sponsor.add": "Νέος μεγάλος χορηγός",
  "platform_sponsor.edit": "Μεγάλος χορηγός",
  "platform_sponsor.logo": "Λογότυπο μεγάλου χορηγού",
  "platform_sponsor.remove": "Διαγραφή μεγάλου χορηγού",
};

//: The log stores column names; the secretary reads Greek.
const KEYS: Record<string, string> = {
  home_score: "Σκορ γηπεδούχου",
  away_score: "Σκορ φιλοξενούμενου",
  home_score_ht: "Ημίχρονο γηπεδούχου",
  away_score_ht: "Ημίχρονο φιλοξενούμενου",
  status: "Κατάσταση",
  minute: "Λεπτό",
  referee: "Διαιτητής",
  note: "Σημείωση",
  is_live: "Live",
  data_source: "Πηγή",
  kind: "Είδος",
  player_name: "Παίκτης",
  team_id: "Ομάδα",
  address: "Διεύθυνση",
  city: "Πόλη",
  postal_code: "Τ.Κ.",
  latitude: "Γεωγρ. πλάτος",
  longitude: "Γεωγρ. μήκος",
  surface: "Επιφάνεια",
  capacity: "Χωρητικότητα",
  has_floodlights: "Προβολείς",
  notes: "Σημειώσεις",
  label: "Ετικέτα",
  prefix: "Πρόθεμα",
  is_active: "Ενεργός",
  replaced_typed_score: "Αντικατέστησε πληκτρολογημένο σκορ",
  name: "Όνομα",
  website_url: "Ιστοσελίδα",
  starts_on: "Έναρξη",
  ends_on: "Λήξη",
  placements: "Θέσεις",
  logo_url: "Λογότυπο",
  url: "Φωτογραφία",
  caption: "Λεζάντα",
  primary_color: "Κύριο χρώμα",
  secondary_color: "Δεύτερο χρώμα",
  team: "Σωματείο",
  matchday: "Αγωνιστική",
  league: "Κατηγορία",
  candidates: "Υποψήφιοι",
  replaced: "Αντικατέστησε προηγούμενη",
  short_name: "Σύντομο όνομα",
};

const PLACEMENT_WORDS: Record<string, string> = {
  site: "όλες οι σελίδες",
  home: "αρχική",
  match: "αγώνες",
  share: "εικόνες κοινοποίησης",
};

const VALUES: Record<string, string> = {
  scheduled: "Προσεχώς",
  live: "Σε εξέλιξη",
  halftime: "Ημίχρονο",
  finished: "Τελικό",
  postponed: "Αναβολή",
  cancelled: "Ματαίωση",
  awarded: "Κατακύρωση",
  scraper: "epsip.gr",
  manual_live: "Χειροκίνητα (live)",
  manual_confirmed: "Χειροκίνητα (επιβεβαιωμένο)",
  true: "Ναι",
  false: "Όχι",
};

const PAGE = 40;

export function AuditList() {
  // Grows by a page at a time, up to what the API gives (200): on a Sunday
  // the match events alone pushed everything else off a fixed 40.
  const [limit, setLimit] = useState(PAGE);
  const { data, error, isLoading } = useSWR<AuditEntry[]>(["editor:audit", limit], () =>
    editorApi.audit(limit),
  );

  if (isLoading) return <p className={styles.loading}>Φόρτωση ιστορικού…</p>;
  if (error) return <Empty title="Δεν φορτώθηκε το ιστορικό" />;
  if (!data?.length)
    return (
      <Empty title="Καμία αλλαγή" body="Δεν έχει γίνει ακόμη καμία διόρθωση." />
    );

  return (
    <ul className={styles.rows}>
      {data.map((entry) => (
        <li key={entry.id} className={styles.auditRow}>
          <div className={styles.auditHead}>
            <span className={styles.auditAction}>
              {ACTIONS[entry.action] ?? entry.action}
              {entry.entity_id ? ` #${entry.entity_id}` : ""}
            </span>
            <span className={styles.auditWho}>
              {entry.user_email ?? "άγνωστος"} ·{" "}
              {new Date(entry.created_at).toLocaleString("el-GR")}
            </span>
          </div>
          <Diff before={entry.old_value} after={entry.new_value} />
        </li>
      ))}
      {data.length >= limit && limit < 200 && (
        <li>
          <button type="button" className={styles.save} onClick={() => setLimit(limit + PAGE)}>
            Περισσότερα
          </button>
        </li>
      )}
    </ul>
  );
}

/** Only the fields that moved, which is all the log stores. */
function Diff({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  // Both sides' keys: a removal has only a "before", and showing just the
  // "after" left a deletion with no word of what was deleted.
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;

  return (
    <ul className={styles.diff}>
      {keys.map((key) => (
        <li key={key}>
          <span className={styles.diffKey}>{KEYS[key] ?? key}</span>
          <span className={styles.diffFrom}>{show(before?.[key])}</span>
          <span aria-hidden="true">→</span>
          <span className={styles.diffTo}>{show(after?.[key])}</span>
        </li>
      ))}
    </ul>
  );
}

const show = (value: unknown): string =>
  value === null || value === undefined || value === "None"
    ? "—"
    : Array.isArray(value)
      ? value.map((v) => PLACEMENT_WORDS[String(v)] ?? String(v)).join(", ")
      : (VALUES[String(value)] ?? String(value));
