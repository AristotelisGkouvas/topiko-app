import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Greek slugs in the URL are meaningful to readers, so they stay decoded in
  // links and get encoded only on the wire.
  trailingSlash: false,
};

export default config;
