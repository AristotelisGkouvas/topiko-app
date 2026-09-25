import type { Metadata } from "next";
import Link from "next/link";

import { NavIcon } from "@/components/NavIcon";
import { PageHeader } from "@/components/PageHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SECONDARY_NAV_ITEMS } from "@/lib/nav";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Περισσότερα",
  description: "Σκόρερ, παίκτες, γήπεδα, ρεκόρ και τα υπόλοιπα.",
};

/** The fifth tab. Everything the other four could not hold.
 *
 *  A list rather than a grid of tiles: these are words of very different
 *  lengths — "Σαν σήμερα" beside "Ποινές" — and a grid would either clip them
 *  or leave holes. The design's own lists are full-width rows, and this is one.
 */
export default function MorePage() {
  return (
    <>
      <PageHeader title="Περισσότερα" />

      <div className={styles.page}>
        <nav className={styles.card} aria-label="Περισσότερες σελίδες">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={styles.row}>
              <span className={styles.icon}>
                <NavIcon item={item} size={20} />
              </span>
              <span className={styles.labelBlock}>
                <span className={styles.label}>{item.label}</span>
                {item.description && (
                  <span className={styles.description}>{item.description}</span>
                )}
              </span>
              <span className={styles.chevron} aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </nav>

        <p className={styles.sectionLabel}>ΡΥΘΜΙΣΕΙΣ</p>
        <div className={styles.card}>
          <Link href="/eidopoiiseis" className={styles.row}>
            <span className={styles.icon}>
              <NavIcon
                item={{ icon: "M5 9v6h3l5 4V5L8 9zM17 9a4 4 0 0 1 0 6" }}
                size={20}
              />
            </span>
            <span className={styles.label}>Ειδοποιήσεις</span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </Link>
          <div className={styles.row}>
            <span className={styles.icon}>
              <NavIcon
                item={{ icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 1 0-16z" }}
                size={20}
              />
            </span>
            <span className={styles.label}>Θέμα εμφάνισης</span>
            <ThemeToggle className={styles.theme} />
          </div>
        </div>

        <p className={styles.sectionLabel}>ΣΩΜΑΤΕΙΑ</p>
        <div className={styles.card}>
          <Link href="/ethelontis" className={styles.row}>
            <span className={styles.icon}>
              <NavIcon
                item={{ icon: "M5 20v-1c0-3 3-5 7-5s7 2 7 5v1M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" }}
                size={20}
              />
            </span>
            <span className={styles.label}>Δήλωση αγώνα</span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </Link>
          <Link href="/diaxeirisi" className={styles.row}>
            <span className={styles.icon}>
              <NavIcon item={{ icon: "M4 6h16M4 12h16M4 18h10" }} size={20} />
            </span>
            <span className={styles.label}>Διαχείριση ένωσης</span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </Link>
        </div>

        <p className={styles.sectionLabel}>ΠΛΗΡΟΦΟΡΙΕΣ</p>
        <div className={styles.card}>
          <Link href="/sxetika" className={styles.row}>
            <span className={styles.icon}>
              <NavIcon item={{ icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01" }} size={20} />
            </span>
            <span className={styles.labelBlock}>
              <span className={styles.label}>Σχετικά</span>
              <span className={styles.description}>
                Τι καλύπτουμε, από πού τα δεδομένα, απόρρητο, λάθη
              </span>
            </span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </Link>
        </div>
      </div>
    </>
  );
}
