import type { Metadata, Viewport } from "next";
import { Fira_Sans_Condensed, Noto_Sans } from "next/font/google";

import { BottomNav } from "@/components/BottomNav";
import { OfflineBar } from "@/components/OfflineBar";
import { SearchShortcut } from "@/components/SearchShortcut";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SiteHeader } from "@/components/SiteHeader";
import { api } from "@/lib/api";
import { leagueLabel, resolveLeague } from "@/lib/leagues";
import { APP_NAME, APP_TAGLINE } from "@/lib/nav";
import "@/styles/globals.css";
import styles from "./layout.module.css";
import { headers } from "next/headers";
import { DEFAULT_ASSOCIATION, TENANT_HEADER, isAssociationSlug } from "@/lib/tenant";
import { Providers } from "@/components/Providers";
import { READABILITY_BOOT } from "@/lib/readabilityBoot";
import { INTRO_BOOT } from "@/lib/introBoot";

/* Both faces are loaded with the Greek subset explicitly — the Latin subset
   alone renders Greek text from a fallback and the page ends up in two
   typefaces at once.

   Each extra static weight is two more files (Greek and Latin). Measured on 3G, preloading ten font files pushed the first paint
   of a match page from 1.5 s to 3.7 s. The display face (headings, scores) is
   still preloaded; the body face is not — for running text the system
   fallback for the first second is an acceptable price. */
const display = Fira_Sans_Condensed({
  subsets: ["greek", "latin"],
  // 800 is the weight the design uses for scores, crests, the winner's name
  // and the promotion zone — 38 rules ask for it. Without the file the
  // browser falls back to 700 and every one of those contrasts goes flat.
  // 400 is not loaded: an audit of every page found four places setting the
  // display face without a weight (match fact labels, the home/away table,
  // "Σαν σήμερα"'s date, the comparison's "vs"); they are 600 now.
  weight: ["600", "700", "800"],
  variable: "--font-fira",
  display: "swap",
});

// Noto Sans is a variable font: with no weight listed, next/font serves the
// one variable file per subset instead of a static file per weight, and every
// weight between 100 and 900 is real rather than synthesised.
const body = Noto_Sans({
  subsets: ["greek", "latin"],
  variable: "--font-noto",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  // Without this, every OpenGraph image is emitted as a relative path and no
  // scraper resolves it — the card silently falls back to a bare link.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Πάμε Σέντρα",
    template: "%s · Πάμε Σέντρα",
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
  openGraph: {
    type: "website",
    locale: "el_GR",
    siteName: "Πάμε Σέντρα",
  },
  // Where the sharing actually happens is Viber and Facebook, both of which
  // read OpenGraph. summary_large_image is here so an X link is not the one
  // place the card shrinks to a thumbnail.
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  // The header bar's colour (--color-bar), per scheme, so the browser chrome
  // matches it in both.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#003c71" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1d30" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only used for the live badge on the tab bar; a backend hiccup should cost
  // the badge, not the whole page.
  const liveCount = await api
    .getMeta()
    .then((meta) => meta.live_matches)
    .catch(() => 0);

  // The header's division chip. Resolved here rather than in each page so the
  // chip says the same thing on every screen, including the ones that have no
  // division of their own — search, the ground pages, the welcome.
  const { leagues, league } = await resolveLeague({}).catch(() => ({
    leagues: [],
    league: null,
  }));
  const tenant = (await headers()).get(TENANT_HEADER);
  const association = isAssociationSlug(tenant) ? tenant : DEFAULT_ASSOCIATION;

  const pickable = leagues.map((l) => ({ slug: l.slug, label: leagueLabel(l) }));

  return (
    <html
      lang="el"
      className={`${display.variable} ${body.variable}`}
      // Read by apiUrl() in the browser: the one place client code learns
      // which ΕΠΣ it is serving. See lib/tenant.ts.
      data-association={association}
      // The pre-paint script below sets data-theme, data-text and
      // data-contrast before React loads, so <html> differs from the server
      // render by design. This silences that one element only, not its tree.
      suppressHydrationWarning
    >
      <head>
        {/* Runs before the first paint. A reader who chose dark and is served
            a light page for one frame sees a flash that no amount of CSS can
            remove afterwards — the attribute has to be on <html> already.
            Wrapped in try/catch because storage can throw, and a theme is not
            worth a blank page. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('pamesentra:theme');" +
              "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}" +
              // Large text and high contrast, for the same reason: a page
              // that jumps size a frame after loading is worse than either.
              READABILITY_BOOT +
              // The home-page intro, once per session; see lib/introBoot.ts.
              INTRO_BOOT,
          }}
        />
      </head>
      <body>
        <Providers>
          <a href="#content" className={styles.skip}>
            Μετάβαση στο περιεχόμενο
          </a>
          <SiteHeader
            leagues={pickable}
            activeLeague={
              league ? { slug: league.slug, label: leagueLabel(league) } : null
            }
          />
          <main id="content" className={styles.main}>
            {/* First in the flow, so it pushes the stale content down instead of
                covering it — screen E1. */}
            <OfflineBar />
            {children}
          </main>
          <BottomNav liveCount={liveCount} />
          <SearchShortcut />
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
