import type { Metadata, Viewport } from "next";
import { Fira_Sans_Condensed, Noto_Sans } from "next/font/google";

import { BottomNav } from "@/components/BottomNav";
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
  title: {
    default: "Πάμε Σέντρα",
    template: "%s · Πάμε Σέντρα",
  },
  description: APP_TAGLINE,
  applicationName: APP_NAME,
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
      </body>
    </html>
  );
}
