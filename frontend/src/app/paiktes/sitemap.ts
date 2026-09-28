import type { MetadataRoute } from "next";

import { api } from "@/lib/api";
import { SITE } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Players with something to read on their page: an appearance on a match
 *  report or a goal on a published list. The register's other names are
 *  noindex and stay out. Grows as the reports are read. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { players } = await api.sitemapLists().catch(() => ({ players: [] }));
  return players.map((slug) => ({
    url: `${SITE}/paiktes/${slug}`,
    changeFrequency: "weekly",
    priority: 0.3,
  }));
}
