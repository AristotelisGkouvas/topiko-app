import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Greek slugs in the URL are meaningful to readers, so they stay decoded in
  // links and get encoded only on the wire.
  trailingSlash: false,
  // Ships a server bundle with only the packages it actually imports, so the
  // runtime image does not carry node_modules for a build that already
  // happened.
  output: "standalone",
  // Memoises components and hooks at build time. Several modules were written
  // assuming it (see the comments in favourite.ts, freshness.ts and
  // LeaguePicker.tsx) while it was off, which is how VenueMap came to rebuild
  // its map on every parent render.
  reactCompiler: true,
  // The old results and fixtures pages, folded into /agones. Kept as
  // redirects so bookmarks and shared links still land somewhere; the query
  // string (league, matchday) carries over unchanged.
  async redirects() {
    return [
      { source: "/apotelesmata", destination: "/agones", permanent: true },
      { source: "/programma", destination: "/agones", permanent: true },
    ];
  },
};

export default config;
