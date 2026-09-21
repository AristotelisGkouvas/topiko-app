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
};

export default config;
