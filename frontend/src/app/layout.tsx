import type { Metadata, Viewport } from "next";
import { Fira_Sans_Condensed, Noto_Sans } from "next/font/google";

import { BottomNav } from "@/components/BottomNav";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SiteHeader } from "@/components/SiteHeader";
import { api } from "@/lib/api";
import { APP_NAME, APP_TAGLINE } from "@/lib/nav";
import "@/styles/globals.css";
import styles from "./layout.module.css";

/* Both faces are loaded with the Greek subset explicitly — the Latin subset
   alone renders Greek text from a fallback and the page ends up in two
   typefaces at once. */
const display = Fira_Sans_Condensed({
  subsets: ["greek", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira",
  display: "swap",
});

const body = Noto_Sans({
  subsets: ["greek", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto",
  display: "swap",
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
  // navy-900, so the browser chrome matches the header bar
  themeColor: "#003c71",
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

  return (
    <html lang="el" className={`${display.variable} ${body.variable}`}>
      <body>
        <a href="#content" className={styles.skip}>
          Μετάβαση στο περιεχόμενο
        </a>
        <SiteHeader />
        <main id="content" className={styles.main}>
          {children}
        </main>
        <BottomNav liveCount={liveCount} />
        <ServiceWorker />
      </body>
    </html>
  );
}
