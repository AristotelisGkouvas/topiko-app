/** The five destinations, in the order the Claude Design file puts them.
 *
 *  This is not the order the site had. The design merges results and fixtures
 *  into one "Αγώνες" tab read by day — which is how somebody actually asks the
 *  question, since "what happened" and "what is on" are the same list seen
 *  from different ends of today — and spends the tab it frees on "Αρχική".
 *  Γήπεδα moves under "Περισσότερα": it is a reference page, looked up once a
 *  season, and it was holding a thumb position.
 *
 *  The icons are the design's own SVG paths rather than the typographic glyphs
 *  the site used. A glyph renders differently on every phone and several of
 *  them had no good character at all.
 */
export interface NavItem {
  href: string;
  label: string;
  /** `d` of a single path on a 24×24 viewBox, stroked not filled. */
  icon: string;
  /** Heavier stroke for icons made of dots, which vanish at 1.8. */
  iconWidth?: number;
  /** Extra paths that should light this tab up. */
  alsoActiveFor?: string[];
  /** Kept out of the phone tab bar and gathered under "Περισσότερα". */
  secondary?: boolean;
}

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Αρχική",
    icon: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
  },
  {
    href: "/agones",
    label: "Αγώνες",
    icon: "M5 6h14v14H5zM5 10h14M9 3v4M15 3v4",
    alsoActiveFor: ["/apotelesmata", "/programma"],
  },
  {
    href: "/vathmologia",
    label: "Βαθμολογία",
    icon: "M4 6h16M4 12h16M4 18h16",
  },
  {
    href: "/somateia",
    label: "Ομάδες",
    icon: "M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z",
  },
  {
    href: "/perissotera",
    label: "Περισσότερα",
    icon: "M6 12h.01M12 12h.01M18 12h.01",
    iconWidth: 3.4,
  },
];

/** Everything the tab bar could not hold. Reached from "Περισσότερα", and on
 *  a wide screen from the header, where there is room for some of it. */
export const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: "/gipeda", label: "Γήπεδα", icon: "M4 6h16v12H4zM12 6v12M4 10h3v4H4M17 10h3v4h-3", secondary: true },
  { href: "/skorer", label: "Σκόρερ", icon: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2", secondary: true },
  { href: "/paiktes", label: "Παίκτες", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-5 8-5s8 1.7 8 5", secondary: true },
  { href: "/poines", label: "Ποινές", icon: "M9 4h8v16H9zM9 4 7 20", secondary: true },
  { href: "/rekor", label: "Ρεκόρ", icon: "m12 4 2.4 5 5.6.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.6-.8z", secondary: true },
  { href: "/san-simera", label: "Σαν σήμερα", icon: "M12 4a8 8 0 1 0 8 8M12 4v4M12 4h4M12 12l4 2", secondary: true },
  { href: "/anakoinoseis", label: "Ανακοινώσεις", icon: "M5 9v6h3l5 4V5L8 9zM17 9a4 4 0 0 1 0 6", secondary: true },
  { href: "/sygkrisi", label: "Σύγκριση", icon: "M4 8h11l-3-3M20 16H9l3 3", secondary: true },
];

export const NAV_ITEMS: NavItem[] = [
  ...PRIMARY_NAV_ITEMS,
  ...SECONDARY_NAV_ITEMS,
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.alsoActiveFor?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // "/" would otherwise prefix-match every page on the site.
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export const APP_NAME = "ΠΑΜΕ ΣΕΝΤΡΑ";
export const APP_MARK = "ΠΣ";
export const APP_TAGLINE = "Αποτελέσματα · Βαθμολογίες · Γήπεδα";
