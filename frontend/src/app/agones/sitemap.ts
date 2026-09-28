import type { MetadataRoute } from "next";

import { api } from "@/lib/api";
import { SITE } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Every played match since the archive begins, at /agones/sitemap.xml. A
 *  result is searched for the evening it happens and then for years by the
 *  two villages. The main sitemap keeps this season's fixtures. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { matches } = await api.sitemapLists().catch(() => ({ matches: [] }));
  return matches.map((m) => ({
    url: `${SITE}/agones/${m.id}`,
    lastModified: new Date(m.updated_at),
    changeFrequency: "yearly",
    priority: 0.4,
  }));
}
