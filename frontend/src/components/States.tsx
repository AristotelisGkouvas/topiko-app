import Link from "next/link";

import styles from "./States.module.css";
import { Icon } from "@/components/Icon";

/** Empty state. Always says what will fill the space and when — an empty box
 *  that only says "nothing here" makes the reader wonder if it is broken. */
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyMark} aria-hidden="true">
        <Icon name="flag" size={22} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      {body && <p className={styles.emptyBody}>{body}</p>}
      {action && (
        <Link href={action.href} className={styles.emptyAction}>
          {action.label} →
        </Link>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className={styles.skeleton} role="status" aria-label="Φόρτωση">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skeletonRow} />
      ))}
    </div>
  );
}
