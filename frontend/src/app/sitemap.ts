import type { MetadataRoute } from "next";

import { api } from "@/lib/api";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Rebuilt on request, not at build time: there is no API during the build,
 *  and the clubs and divisions change with every season. */
export const dynamic = "force-dynamic";

/** The pages somebody searches for by name — "Δαφνούλας βαθμολογία", "γήπεδο
 *  Τσανακτσής" — plus each division's table and fixtures. Players are left
 *  out: fifteen thousand thin pages would drown the ones that matter. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "weekly") => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  const fixed = [
    page("/", 1, "daily"),
    page("/agones", 0.9, "daily"),
    page("/vathmologia", 0.9, "daily"),
    page("/skorer", 0.7, "daily"),
    page("/somateia", 0.7),
    page("/gipeda", 0.5),
    page("/poines", 0.5, "daily"),
    page("/rekor", 0.4, "monthly"),
    page("/paiktes", 0.4),
    page("/sxetika", 0.2, "monthly"),
  ];

  // A sitemap that fails takes nothing down; it just lists what it can.
  const [leagues, teams, fields] = await Promise.all([
    api.listLeagues().catch(() => []),
    api.listTeams().catch(() => []),
    api.listFields().catch(() => []),
  ]);

  return [
    ...fixed,
    ...leagues.flatMap((l) => [
      page(`/vathmologia?liga=${l.slug}`, 0.8, "daily"),
      page(`/agones?liga=${l.slug}`, 0.8, "daily"),
    ]),
    // Clubs that play this season first-class; folded ones still exist but
    // change once a decade.
    ...teams.map((t) =>
      t.active === false
        ? page(`/somateia/${t.slug}`, 0.3, "monthly")
        : page(`/somateia/${t.slug}`, 0.7, "daily"),
    ),
    ...fields.map((f) => page(`/gipeda/${f.slug}`, 0.4, "monthly")),
  ];
}
