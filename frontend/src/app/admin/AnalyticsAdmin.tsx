"use client";

import { useState } from "react";
import useSWR from "swr";

import { Empty } from "@/components/States";
import { apiFetch, apiUrl } from "@/lib/api";
import type { components } from "@/lib/api-schema";
import styles from "./AnalyticsAdmin.module.css";
import page from "./page.module.css";

type Summary = components["schemas"]["AnalyticsOut"];
type Counted = components["schemas"]["Counted"];

const num = new Intl.NumberFormat("el-GR");
const pct = (share: number | null | undefined) =>
  share == null ? "—" : `${Math.round(share * 100)}%`;

const EVENT_LABELS: Record<string, string> = {
  share: "Κοινοποιήσεις",
  directions: "Οδηγίες προς γήπεδο",
  story: "Εικόνα για story",
  table_image: "Εικόνα βαθμολογίας",
  copy_text: "Αντιγραφή ως κείμενο",
  calendar: "Πρόγραμμα στο ημερολόγιο",
  follow: "«Η ομάδα μου»",
  unfollow: "Αφαίρεση ομάδας",
  search: "Αναζητήσεις",
  notify_on: "Ενεργοποίηση ειδοποιήσεων",
  notify_off: "Απενεργοποίηση ειδοποιήσεων",
  install_prompt: "Εγκατάσταση εφαρμογής",
  installed: "Εγκαταστάθηκε",
  theme: "Αλλαγή θέματος",
  readability: "Ρυθμίσεις ανάγνωσης",
  prediction: "Ψήφοι πρόβλεψης",
  mvp_vote: "Ψήφοι MVP",
  outbound: "Σύνδεσμοι προς άλλα sites",
  not_found: "Σελίδες που δεν βρέθηκαν",
};

const VITAL_LABELS: Record<string, { label: string; good: number; unit: string }> = {
  LCP: { label: "Φόρτωση κύριου περιεχομένου (LCP)", good: 2500, unit: "ms" },
  INP: { label: "Απόκριση στο πάτημα (INP)", good: 200, unit: "ms" },
  CLS: { label: "Μετακίνηση στοιχείων (CLS)", good: 0.1, unit: "" },
  FCP: { label: "Πρώτη εμφάνιση (FCP)", good: 1800, unit: "ms" },
  TTFB: { label: "Απόκριση server (TTFB)", good: 800, unit: "ms" },
};

const WEEKDAYS = ["Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ", "Κυρ"];

/** Readership, anonymously counted: admin only. */
export function AnalyticsAdmin() {
  const [days, setDays] = useState(30);
  const { data, error, isLoading } = useSWR<Summary>(["editor:analytics", days], () =>
    apiFetch<Summary>(apiUrl(`/editor/analytics?days=${days}`), { credentials: "include" }),
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.filters} role="group" aria-label="Περίοδος">
        {[7, 30, 90, 365].map((d) => (
          <button
            key={d}
            type="button"
            className={`${styles.range} ${days === d ? styles.rangeOn : ""}`}
            aria-pressed={days === d}
            onClick={() => setDays(d)}
          >
            {d === 365 ? "12 μήνες" : `${d} ημέρες`}
          </button>
        ))}
      </div>

      {isLoading && <p className={page.loading}>Φόρτωση στατιστικών…</p>}
      {error && <Empty title="Δεν φορτώθηκαν τα στατιστικά" body="Δοκίμασε ξανά σε λίγο." />}
      {data && <Report data={data} />}

      <p className={styles.note}>
        Ανώνυμα, χωρίς cookies: δεν αποθηκεύονται διευθύνσεις IP ούτε στοιχεία που ταυτοποιούν
        πρόσωπα. Οι «επισκέπτες» μετρώνται ανά ημέρα — ο ίδιος άνθρωπος σε δύο μέρες μετράει δύο
        φορές. Δεν μετρώνται bots, όσοι έχουν ενεργό Global Privacy Control και οι σελίδες
        διαχείρισης.
      </p>
    </div>
  );
}

function Report({ data }: { data: Summary }) {
  const t = data.totals;
  if (t.views === 0) {
    return (
      <Empty
        title="Καμία επίσκεψη ακόμη"
        body="Η καταγραφή ξεκίνησε με την τελευταία ενημέρωση του site· τα νούμερα θα εμφανιστούν με τις πρώτες επισκέψεις."
      />
    );
  }
  return (
    <>
      <div className={styles.tiles}>
        <Tile label="Προβολές σελίδων" value={num.format(t.views)} />
        <Tile label="Επισκέπτες (ημερήσιοι)" value={num.format(t.visitors)} />
        <Tile label="Σελίδες ανά επισκέπτη" value={t.views_per_visitor?.toLocaleString("el-GR") ?? "—"} />
        <Tile label="Χρόνος ανά σελίδα" value={t.avg_seconds != null ? `${Math.round(t.avg_seconds)}″` : "—"} />
        <Tile label="Κύλιση (μέσος όρος)" value={t.avg_scroll != null ? `${Math.round(t.avg_scroll)}%` : "—"} />
        <Tile label="Από εγκατεστημένη εφαρμογή" value={pct(t.installed_share)} />
        <Tile label="Σκούρο θέμα" value={pct(t.dark_share)} />
        <Tile label="Ψήφοι πρόβλεψης" value={num.format(data.predictions)} />
        <Tile label="Ψήφοι MVP" value={num.format(data.mvp_votes)} />
        <Tile label="Εγγραφές σε ειδοποιήσεις (σύνολο)" value={num.format(data.push_subscriptions)} />
      </div>

      <Section title="Προβολές ανά ημέρα">
        <Columns
          points={data.per_day.map((d) => ({
            label: new Date(d.day).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" }),
            value: d.views,
            detail: `${num.format(d.views)} προβολές · ${num.format(d.visitors)} επισκέπτες`,
          }))}
          caption="Προβολές ανά ημέρα"
        />
      </Section>

      <div className={styles.pair}>
        <Section title="Ώρα της ημέρας">
          <Columns
            points={data.hours.map((v, h) => ({ label: `${h}`, value: v, detail: `${h}:00–${h}:59 · ${num.format(v)}` }))}
            caption="Προβολές ανά ώρα"
            everyLabel={6}
          />
        </Section>
        <Section title="Μέρα της εβδομάδας">
          <Columns
            points={data.weekdays.map((v, i) => ({ label: WEEKDAYS[i], value: v, detail: `${WEEKDAYS[i]} · ${num.format(v)}` }))}
            caption="Προβολές ανά μέρα της εβδομάδας"
            everyLabel={1}
          />
        </Section>
      </div>

      <div className={styles.grid}>
        <Section title="Σελίδες">
          <Bars rows={data.routes} />
        </Section>
        <Section title="Πιο δημοφιλείς αγώνες">
          <Bars rows={data.matches} empty="Καμία σελίδα αγώνα ακόμη." />
        </Section>
        <Section title="Πιο δημοφιλή σωματεία">
          <Bars rows={data.teams} empty="Καμία σελίδα σωματείου ακόμη." />
        </Section>
        <Section title="Κατηγορίες που διαβάζονται">
          <Bars rows={data.leagues} empty="—" />
        </Section>
        <Section title="Παίκτες">
          <Bars rows={data.players} empty="Καμία σελίδα παίκτη ακόμη." />
        </Section>
        <Section title="Από πού ήρθαν">
          <Bars rows={data.referrers} empty="Όλοι απευθείας (χωρίς σύνδεσμο από άλλο site)." />
        </Section>
        <Section title="Καμπάνιες (utm)">
          <Bars rows={data.campaigns} empty="Καμία. Βάλε ?utm_source=… στους συνδέσμους που μοιράζεις." />
        </Section>
        <Section title="Συσκευή">
          <Bars rows={data.devices} />
        </Section>
        <Section title="Browser">
          <Bars rows={data.browsers} />
        </Section>
        <Section title="Λειτουργικό">
          <Bars rows={data.oses} />
        </Section>
        <Section title="Πλάτος οθόνης (px)">
          <Bars rows={data.widths.map((w) => ({ ...w, label: `${w.key}–${Number(w.key) + 99}` }))} />
        </Section>
        <Section title="Γλώσσα browser">
          <Bars rows={data.langs} />
        </Section>
        <Section title="Ενέργειες">
          <Bars rows={data.events.map((e) => ({ ...e, label: EVENT_LABELS[e.key] ?? e.key }))} empty="Καμία ακόμη." />
        </Section>
        <Section title="Τι αναζητούν">
          <Bars rows={data.searches} empty="Καμία αναζήτηση ακόμη." />
        </Section>
        <Section title="«Η ομάδα μου»">
          <Bars rows={data.follows} empty="Κανείς δεν διάλεξε ομάδα ακόμη." />
        </Section>
        <Section title="Κοινοποιήσεις ανά σελίδα">
          <Bars rows={data.shares} empty="Καμία κοινοποίηση ακόμη." />
        </Section>
        <Section title="Live καταχωρίσεις ανά σωματείο">
          <Bars rows={data.live_events} empty="Καμία live καταχώριση ακόμη." />
        </Section>
      </div>

      <Section title="Χορηγοί">
        {data.sponsors.length === 0 ? (
          <p className={styles.muted}>Καμία προβολή χορηγού στην περίοδο.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Χορηγός</th>
                <th scope="col">Είδος</th>
                <th scope="col" className={styles.numCol}>Προβολές</th>
                <th scope="col" className={styles.numCol}>Κλικ</th>
                <th scope="col" className={styles.numCol}>Ποσοστό κλικ</th>
              </tr>
            </thead>
            <tbody>
              {data.sponsors.map((s) => (
                <tr key={`${s.kind}-${s.name}`}>
                  <td>{s.name}</td>
                  <td>{s.kind === "platform" ? "Πλατφόρμας" : "Σωματείου"}</td>
                  <td className={styles.numCol}>{num.format(s.views)}</td>
                  <td className={styles.numCol}>{num.format(s.clicks)}</td>
                  <td className={styles.numCol}>
                    {s.views ? `${((s.clicks / s.views) * 100).toFixed(1).replace(".", ",")}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className={styles.grid}>
        <Section title="Ταχύτητα (75ο εκατοστημόριο)">
          {data.vitals.length === 0 ? (
            <p className={styles.muted}>Δεν υπάρχουν ακόμη μετρήσεις.</p>
          ) : (
            <ul className={styles.vitals}>
              {data.vitals.map((v) => {
                const meta = VITAL_LABELS[v.name];
                const good = meta ? v.p75 <= meta.good : true;
                return (
                  <li key={v.name}>
                    <span>{meta?.label ?? v.name}</span>
                    <strong>
                      {meta?.unit === "ms" ? `${num.format(Math.round(v.p75))} ms` : v.p75.toFixed(3).replace(".", ",")}
                    </strong>
                    <span className={good ? styles.ok : styles.warn}>
                      {good ? "✓ καλό" : "⚠ αργό"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title="Σφάλματα στον browser">
          <Bars rows={data.errors} empty="Κανένα σφάλμα. 👍" />
        </Section>
        <Section title="Σύνδεσμοι που δεν βρέθηκαν (404)">
          <Bars rows={data.not_found} empty="Κανένας." />
        </Section>
        <Section title="Ενημέρωση από την ΕΠΣ (scraper)">
          <p className={styles.muted}>
            Τελευταία εκτέλεση:{" "}
            {data.scraper.last_run_at
              ? new Date(data.scraper.last_run_at).toLocaleString("el-GR")
              : "—"}{" "}
            ({data.scraper.last_status ?? "—"}) · {num.format(data.scraper.runs)} εκτελέσεις στην
            περίοδο, {num.format(data.scraper.failures)} αποτυχίες.
          </p>
        </Section>
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

/** Vertical columns, one series: one colour, value on hover, a table for
 *  anybody who wants the numbers rather than the shape. */
function Columns({
  points,
  caption,
  everyLabel,
}: {
  points: { label: string; value: number; detail: string }[];
  caption: string;
  everyLabel?: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = everyLabel ?? Math.max(1, Math.ceil(points.length / 8));
  return (
    <figure className={styles.figure}>
      <div className={styles.columnsWrap}>
        <span className={styles.axisMax} aria-hidden="true">
          {num.format(max)}
        </span>
        <div className={styles.columns} aria-hidden="true">
          {points.map((p, i) => (
            <div key={i} className={styles.col} tabIndex={-1}>
              <span
                className={styles.colBar}
                style={{ height: `${(p.value / max) * 100}%` }}
              />
              <span className={styles.tip}>{p.detail}</span>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.colLabels} aria-hidden="true">
        {points.map((p, i) => (
          <span key={i}>{i % step === 0 ? p.label : ""}</span>
        ))}
      </div>
      <details className={styles.tableToggle}>
        <summary>Πίνακας</summary>
        <table className={styles.table}>
          <caption className="srOnly">{caption}</caption>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <th scope="row">{p.label}</th>
                <td className={styles.numCol}>{num.format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Horizontal bars for a top list: the label, a bar, the count. */
function Bars({ rows, empty = "—" }: { rows: Counted[]; empty?: string }) {
  if (rows.length === 0) return <p className={styles.muted}>{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ol className={styles.bars}>
      {rows.map((r) => (
        <li key={r.key} className={styles.barRow} title={r.visitors != null ? `${num.format(r.visitors)} επισκέπτες` : undefined}>
          <span className={styles.barLabel}>{r.label}</span>
          <span className={styles.barTrack} aria-hidden="true">
            <span className={styles.barFill} style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className={styles.barValue}>{num.format(r.count)}</span>
        </li>
      ))}
    </ol>
  );
}
