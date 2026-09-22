import type { MetadataRoute } from "next";

import { APP_NAME, APP_TAGLINE } from "@/lib/nav";

/** Makes the site installable.
 *
 *  A results site is opened every Sunday afternoon and forgotten the rest of
 *  the week, which is exactly the shape of thing that belongs on a home screen
 *  rather than in a bookmark folder nobody opens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Πάμε Σέντρα",
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "el",
    // navy-900, so the status bar continues the header rather than framing it.
    background_color: "#003c71",
    theme_color: "#003c71",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        // Android crops a circle out of this, so the artwork keeps its margin.
        purpose: "maskable",
      },
    ],
  };
}
