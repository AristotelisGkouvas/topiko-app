"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavIcon } from "./NavIcon";
import { PRIMARY_NAV_ITEMS, isActive } from "@/lib/nav";
import styles from "./BottomNav.module.css";

/** The phone tab bar, to the design file's own numbers.
 *
 *  The design colours the icon and the label together — grey #6C6F72 idle,
 *  green #128C40 active — and draws no pill behind the active icon. The site
 *  used to tint a pill instead, which read as a selected chip rather than a
 *  place you are.
 */
export function BottomNav({ liveCount = 0 }: { liveCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className={styles.bar} aria-label="Πλοήγηση">
      {PRIMARY_NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        // Live matches live under Αγώνες now that results and fixtures are
        // one tab; the dot has to move with them.
        const showBadge = liveCount > 0 && item.href === "/agones";
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.tab} ${active ? styles.active : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.icon}>
              <NavIcon item={item} />
              {showBadge && <span className={styles.badge} />}
            </span>
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
