"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";

import { Wordmark } from "./Logo";
import { LeaguePicker, type PickerLeague } from "./LeaguePicker";
import { NavIcon } from "./NavIcon";
import { ThemeToggle } from "./ThemeToggle";
import { apiUrl, jsonFetcher } from "@/lib/api";
import type { Association } from "@/lib/types";
import {
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  isActive,
  type NavItem,
} from "@/lib/nav";
import styles from "./SiteHeader.module.css";

/** The design file's two headers, which are not the same header.
 *
 *  On a phone it is a brand bar: the stacked lockup and the search box —
 *  14px/16px padding, nothing else, because the five destinations are already
 *  under the thumb at the bottom. The lockup only, not the ΠΣ tile: the handoff
 *  reserves that tile for the app icon, the favicon and notifications.
 *
 *  On a wide screen it is a 60px navy bar carrying the whole of the navigation
 *  as pills, with the search field pushed to the right. The two dropdowns are
 *  the design's "Στατιστικά ▾" and "Ένωση ▾": everything the tab bar could not
 *  hold, grouped rather than listed, because eleven pills across is a wall.
 */

/** "Στατιστικά ▾" — the pages that answer a question about numbers. */
const STATS_MENU = ["/skorer", "/paiktes", "/rekor", "/sygkrisi", "/poines"];
/** "Ένωση ▾" — the pages about the federation rather than the football. */
const UNION_MENU = ["/gipeda", "/anakoinoseis", "/san-simera", "/sxetika"];

const bySlug = (hrefs: string[]): NavItem[] =>
  hrefs
    .map((href) => SECONDARY_NAV_ITEMS.find((item) => item.href === href))
    .filter((item): item is NavItem => item !== undefined);

export function SiteHeader({
  leagues = [],
  activeLeague = null,
}: {
  leagues?: PickerLeague[];
  activeLeague?: PickerLeague | null;
}) {
  const pathname = usePathname();
  const stats = bySlug(STATS_MENU);
  const union = [
    ...bySlug(UNION_MENU.filter((href) => href !== "/sxetika")),
    { href: "/sxetika", label: "Σχετικά", icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01" },
  ];
  // Which federation this is, under the logo. A visitor from a shared link
  // otherwise has no way of telling that the site covers one ΕΠΣ and not
  // Greece. Fetched once and kept; it does not change during a visit.
  const { data: association } = useSWR<Association>(apiUrl(""), jsonFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  // Embedded in another site's iframe: no chrome around the table.
  if (pathname.startsWith("/embed")) return null;

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link
          href="/"
          className={styles.brand}
          aria-label={
            association ? `Πάμε Σέντρα · ${association.name}` : "Πάμε Σέντρα"
          }
        >
          <Wordmark />
          {association && (
            <span className={styles.association} aria-hidden="true">
              {association.short_name ?? association.name}
            </span>
          )}
        </Link>

        {/* Wide screens only: the phone has these at the bottom. */}
        <nav className={styles.nav} aria-label="Κύρια πλοήγηση">
          {PRIMARY_NAV_ITEMS.filter((item) => item.href !== "/perissotera").map(
            (item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.pill} ${
                  isActive(item, pathname) ? styles.pillActive : ""
                }`}
                aria-current={isActive(item, pathname) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ),
          )}

          <Menu label="Στατιστικά" items={stats} pathname={pathname} />
          <Menu label="Ένωση" items={union} pathname={pathname}>
            {/* The design never draws a theme control, but it does draw four
                dark screens. It belongs with the settings-shaped things
                rather than as a sixth icon in the bar. */}
            <span className={styles.menuTheme}>
              <span>Θέμα</span>
              <ThemeToggle className={styles.theme} />
            </span>
            {/* Said where a visitor from elsewhere looks for their own ΕΠΣ. */}
            <span className={styles.menuNote}>
              {association?.name ?? "Μία ένωση"} προς το παρόν · άλλες ενώσεις σύντομα
            </span>
          </Menu>
        </nav>

        {/* Phone only: the division the reader is looking at, and the way to
            change it. On a wide screen the left-hand rail does this. */}
        <div className={styles.leagueWrap}>
          <LeaguePicker leagues={leagues} active={activeLeague} />
        </div>

        {/* The design's search field: a filled slot on the navy, not an icon.
            On a phone it collapses to the icon, where 240px will not fit. */}
        <Link href="/anazitisi" className={styles.search}>
          <span className={styles.searchIcon} aria-hidden="true">
            ⌕
          </span>
          <span className={styles.searchText}>Αναζήτηση ομάδας, παίκτη…</span>
          {/* A shortcut nobody is told about is a shortcut nobody uses. */}
          <span className={styles.searchKey} aria-hidden="true">
            /
          </span>
          <span className={styles.searchLabel}>Αναζήτηση</span>
        </Link>
      </div>
    </header>
  );
}

/** One of the header's two dropdowns.
 *
 *  A `<details>` rather than a button with state: it opens on click and on
 *  Enter, closes on Escape, and is reachable by keyboard without any of that
 *  being written here. The cost is that two open at once, which the CSS below
 *  does not mind.
 */
function Menu({
  label,
  items,
  pathname,
  children,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  children?: React.ReactNode;
}) {
  const here = items.some((item) => isActive(item, pathname));

  return (
    <details className={styles.menu}>
      <summary className={`${styles.pill} ${here ? styles.pillActive : ""}`}>
        {label}
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className={styles.menuPanel}>
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={styles.menuItem}
            aria-current={isActive(item, pathname) ? "page" : undefined}
          >
            <span className={styles.menuIcon}>
              <NavIcon item={item} size={17} />
            </span>
            {item.label}
          </Link>
        ))}
        {children}
      </div>
    </details>
  );
}
