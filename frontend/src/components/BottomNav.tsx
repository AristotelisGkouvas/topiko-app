"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRIMARY_NAV_ITEMS, isActive } from "@/lib/nav";
import styles from "./BottomNav.module.css";

/** Sticky tab bar for narrow viewports. Five destinations, 48px hit targets,
 *  no badges except live matches. */
export function BottomNav({ liveCount = 0 }: { liveCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className={styles.bar} aria-label="Πλοήγηση">
      {PRIMARY_NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        const showBadge = liveCount > 0 && item.href === "/apotelesmata";
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.tab} ${active ? styles.active : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.glyph} aria-hidden="true">
              {item.glyph}
              {showBadge && <span className={styles.badge} />}
            </span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
