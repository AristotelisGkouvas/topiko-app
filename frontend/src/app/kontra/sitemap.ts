import type { MetadataRoute } from "next";

import { api } from "@/lib/api";
import { SITE, kontraPath } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Every pair of clubs that has met, once, under its canonical order: the
 *  search "Κόνιτσα Ελεούσα" asks for exactly this page. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { pairs } = await api.sitemapLists().catch(() => ({ pairs: [] }));
  return pairs.map(([a, b]) => ({
    url: `${SITE}${kontraPath(a, b)}`,
    changeFrequency: "monthly",
    priority: 0.4,
  }));
}
