import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Everything public is crawlable. Kept out: the admin panel, which has no
 *  business in a search result, and the embed, which is a copy of the table
 *  meant for other people's sites and would compete with the real page. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/embed/", "/ethelontis"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
