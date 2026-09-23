"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { APP_TAGLINE, NAV_ITEMS, isActive } from "@/lib/nav";
import { Logo, Wordmark } from "./Logo";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          {/* The mark carries ΠΣ itself now, so the old badge wrapper goes. */}
          <Logo size={34} />
          <span className={styles.brandText}>
            <Wordmark />
            <span className={styles.tagline}>{APP_TAGLINE}</span>
          </span>
        </Link>

        {/* Hidden on phones, where the bottom bar carries the same five
            destinations within thumb reach. */}
        <nav className={styles.nav} aria-label="Κύρια πλοήγηση">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${
                isActive(item, pathname) ? styles.navActive : ""
              }`}
              aria-current={isActive(item, pathname) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
