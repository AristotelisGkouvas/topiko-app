import Link from "next/link";

import styles from "./SectionHeader.module.css";

/** The small uppercase label + optional link that opens every home-page block
 *  ("ΒΑΘΜΟΛΟΓΙΑ … Πλήρης"). */
export function SectionHeader({
  title,
  id,
  action,
}: {
  title: string;
  id?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className={styles.header}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      {action && (
        <Link href={action.href} className={styles.action}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
