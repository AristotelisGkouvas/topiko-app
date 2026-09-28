import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ApiError, api } from "@/lib/api";
import { mediaUrl } from "@/lib/media";
import type { SponsorReport } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Αναφορά χορηγού",
  robots: { index: false, follow: false },
};

const PLACEMENT: Record<string, string> = {
  site: "Σε όλο το site",
  home: "Στην αρχική",
  match: "Στις σελίδες αγώνων",
  share: "Στις εικόνες για Facebook και Viber",
  club: "Στη σελίδα της ομάδας",
};

const MONTH = new Intl.DateTimeFormat("el-GR", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("el-GR", { month: "long", year: "numeric", timeZone: "UTC" });
const NUMBER = new Intl.NumberFormat("el-GR");

async function load(token: string): Promise<SponsorReport> {
  try {
    return await api.sponsorReport(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

/** What a sponsor opens from the link the office sends them: how often their
 *  logo was on a reader's screen and how often it was clicked, month by
 *  month. The argument at renewal time: a shirt gives no numbers.
 *
 *  Not indexed, not linked from anywhere: the unguessable link is the key. */
export default async function SponsorReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await load(token);
  const months = report.months;
  const current = months[months.length - 1];
  const previous = months[months.length - 2];
  const peak = Math.max(1, ...months.map((m) => m.views));
  const logo = mediaUrl(report.logo_url);
  const rate = (views: number, clicks: number) =>
    views ? `${((clicks / views) * 100).toLocaleString("el-GR", { maximumFractionDigits: 1 })}%` : "–";

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- a sponsor's own uploaded logo, already small
          <img src={logo} alt="" className={styles.logo} />
        )}
        <div>
          <h1 className={styles.name}>{report.name}</h1>
          <p className={styles.sub}>
            {report.kind === "club"
              ? `Χορηγός του ${report.club_name ?? "σωματείου"} στο Πάμε Σέντρα`
              : "Χορηγός του Πάμε Σέντρα"}
          </p>
        </div>
      </header>

      <dl className={styles.hero}>
        <div>
          <dt>Προβολές, {current ? MONTH_LONG.format(new Date(current.month)) : "αυτόν τον μήνα"}</dt>
          <dd>{NUMBER.format(current?.views ?? 0)}</dd>
        </div>
        <div>
          <dt>Κλικ στο λογότυπο</dt>
          <dd>{NUMBER.format(current?.clicks ?? 0)}</dd>
        </div>
        <div>
          <dt>Τον προηγούμενο μήνα</dt>
          <dd>{NUMBER.format(previous?.views ?? 0)}</dd>
        </div>
      </dl>

      <section className={styles.chartBlock} aria-labelledby="chart-title">
        <h2 id="chart-title" className={styles.h2}>Προβολές ανά μήνα</h2>
        <div className={styles.chart} role="img" aria-label="Προβολές ανά μήνα, οι τελευταίοι 12 μήνες. Τα ίδια νούμερα είναι στον πίνακα από κάτω.">
          {months.map((m) => {
            const label = MONTH.format(new Date(m.month));
            return (
              <div key={m.month} className={styles.col} tabIndex={0}>
                <span className={styles.tip} role="tooltip">
                  <strong>{MONTH_LONG.format(new Date(m.month))}</strong>
                  <br />
                  {NUMBER.format(m.views)} προβολές · {NUMBER.format(m.clicks)} κλικ
                </span>
                <span
                  className={styles.bar}
                  style={{ height: `${Math.max(m.views ? 2 : 0, (m.views / peak) * 100)}%` }}
                />
                <span className={styles.month}>{label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="table-title">
        <h2 id="table-title" className={styles.h2}>Αναλυτικά</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Μήνας</th>
                <th scope="col" className={styles.num}>Προβολές</th>
                <th scope="col" className={styles.num}>Κλικ</th>
                <th scope="col" className={styles.num}>Ποσοστό κλικ</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <td>{MONTH_LONG.format(new Date(m.month))}</td>
                  <td className={styles.num}>{NUMBER.format(m.views)}</td>
                  <td className={styles.num}>{NUMBER.format(m.clicks)}</td>
                  <td className={styles.num}>{rate(m.views, m.clicks)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">12 μήνες</th>
                <td className={styles.num}>{NUMBER.format(report.views_total)}</td>
                <td className={styles.num}>{NUMBER.format(report.clicks_total)}</td>
                <td className={styles.num}>{rate(report.views_total, report.clicks_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={styles.about}>
        <h2 className={styles.h2}>Πού εμφανίζεται</h2>
        <ul>
          {report.placements.map((p) => (
            <li key={p}>{PLACEMENT[p] ?? p}</li>
          ))}
        </ul>
        {(report.starts_on || report.ends_on) && (
          <p>
            Διάρκεια: {report.starts_on ? new Date(report.starts_on).toLocaleDateString("el-GR") : "από την αρχή"}
            {" έως "}
            {report.ends_on ? new Date(report.ends_on).toLocaleDateString("el-GR") : "χωρίς λήξη"}
          </p>
        )}
        <p className={styles.small}>
          Προβολή είναι κάθε φορά που το λογότυπο εμφανίστηκε στην οθόνη ενός
          αναγνώστη. Κλικ είναι κάθε φορά που το πάτησε κάποιος και πήγε στη
          σελίδα σας. Μετράμε χωρίς cookies και χωρίς να ξέρουμε ποιος είναι ο
          αναγνώστης. Επανάληψη από την ίδια συσκευή την ίδια μέρα μετράει μία φορά.
        </p>
      </section>
    </div>
  );
}
