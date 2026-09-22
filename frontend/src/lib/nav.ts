/** The five destinations from the UI kit, in kit order.
 *
 *  The home page is not a sixth tab: on a phone the home screen *is* the
 *  standings view (live strip, table preview, next fixtures), so "/" counts as
 *  active for the first tab rather than adding a destination the design does
 *  not have.
 */
export interface NavItem {
  href: string;
  label: string;
  glyph: string;
  /** Extra paths that should light this tab up. */
  alsoActiveFor?: string[];
  /** Kept out of the phone tab bar.
   *
   *  The kit's bottom bar is five 48px targets across the narrowest screen we
   *  support; a sixth would shrink all of them to add one. Secondary
   *  destinations live in the header, where there is room, and are reached on
   *  a phone from the page they belong to. */
  secondary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/vathmologia",
    label: "Βαθμολογίες",
    glyph: "≡",
    alsoActiveFor: ["/"],
  },
  { href: "/apotelesmata", label: "Αποτελέσματα", glyph: "⚑" },
  { href: "/programma", label: "Πρόγραμμα", glyph: "▤" },
  { href: "/gipeda", label: "Γήπεδα", glyph: "⌖" },
  { href: "/somateia", label: "Σωματεία", glyph: "⬢" },
  { href: "/skorer", label: "Σκόρερ", glyph: "◎", secondary: true },
  { href: "/paiktes", label: "Παίκτες", glyph: "☗", secondary: true },
  { href: "/san-simera", label: "Σαν σήμερα", glyph: "⟳", secondary: true },
  { href: "/poines", label: "Ποινές", glyph: "⊘", secondary: true },
  { href: "/rekor", label: "Ρεκόρ", glyph: "★", secondary: true },
];

/** The five that fit the phone tab bar. */
export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.secondary);

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.alsoActiveFor?.includes(pathname)) return true;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const APP_NAME = "ΠΑΜΕ ΣΕΝΤΡΑ";
export const APP_MARK = "ΠΣ";
export const APP_TAGLINE = "Αποτελέσματα · Βαθμολογίες · Γήπεδα";
