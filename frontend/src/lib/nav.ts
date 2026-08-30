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
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.alsoActiveFor?.includes(pathname)) return true;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const APP_NAME = "ΠΑΜΕ ΣΕΝΤΡΑ";
export const APP_MARK = "ΠΣ";
export const APP_TAGLINE = "Αποτελέσματα · Βαθμολογίες · Γήπεδα";
