import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./BandHeader.module.css";

/** The white band the newer pages open with (designs "On This Day",
 *  "Ground", "Suspensions"): the crumb, the title and a line under it, the
 *  page's controls on the right, and its headline numbers along the bottom.
 *  Full bleed: the band runs to both edges of the window. */
export function BandHeader({
  crumbs,
  title,
  sub,
  lead,
  aside,
  kpis = [],
  below,
}: {
  crumbs: { label: string; href?: string }[];
  title: ReactNode;
  sub?: ReactNode;
  /** Something before the title: a crest, a photo. */
  lead?: ReactNode;
  aside?: ReactNode;
  kpis?: { v: ReactNode; l: string }[];
  /** Under everything, on the band: tabs. */
  below?: ReactNode;
}) {
  return (
    <header className={styles.band}>
      <div className={styles.inner}>
        <nav className={styles.crumbs} aria-label="Διαδρομή">
          {crumbs.map((c, i) => (
            <span key={i} className={styles.crumb}>
              {i > 0 && <span aria-hidden="true">›</span>}
              {c.href ? (
                <Link href={c.href}>{c.label}</Link>
              ) : (
                <span aria-current={i === crumbs.length - 1 ? "page" : undefined}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        <div className={styles.row}>
          <div className={styles.who}>
            {lead}
            <div className={styles.titles}>
              <h1 className={styles.title}>{title}</h1>
              {sub && <div className={styles.sub}>{sub}</div>}
            </div>
          </div>
          {aside && <div className={styles.aside}>{aside}</div>}
        </div>
        {kpis.length > 0 && (
          <dl className={styles.kpis}>
            {kpis.map((k) => (
              <div key={k.l} className={styles.kpi}>
                <dt className={styles.kpiLabel}>{k.l}</dt>
                <dd className={styles.kpiValue}>{k.v}</dd>
              </div>
            ))}
          </dl>
        )}
        {below}
      </div>
    </header>
  );
}
