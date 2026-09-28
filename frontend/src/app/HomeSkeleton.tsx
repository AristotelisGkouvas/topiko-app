import { TableSkeleton } from "@/components/States";
import states from "@/components/States.module.css";
import styles from "./page.module.css";

/** The home page's shape while it loads: the club card, a round of two-line
 *  match rows, and the table beside them on a wide screen. Same grid as the
 *  real page, so nothing jumps when the data arrives. */
export function HomeSkeleton() {
  return (
    <div className={`${styles.page} ${styles.home}`} role="status" aria-label="Φόρτωση">
      <div aria-hidden="true" />
      <div className={styles.main} aria-hidden="true">
        <div className={`${states.skeleton} ${states.skeletonBlock}`} />
        <div className={states.skeleton}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`${states.skeletonRow} ${states.skeletonMatch}`} />
          ))}
        </div>
      </div>
      <div className={styles.side} aria-hidden="true">
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
