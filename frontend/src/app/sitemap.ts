import type { MetadataRoute } from "next";

import { api } from "@/lib/api";
import { SITE, kontraPath } from "@/lib/seo";

/** Rebuilt on request, not at build time: there is no API during the build,
 *  and the clubs and divisions change with every season. */
export const dynamic = "force-dynamic";

/** The pages somebody searches for by name — "Δαφνούλας βαθμολογία", "γήπεδο
 *  Τσανακτσής", "Ροδοτόπι Κεφαλόβρυσο" — plus each division's table and
 *  fixtures. Players only if they scored this season: fifteen thousand thin
 *  pages would drown the ones that matter. Grounds only if a club plays
 *  there; the rest are noindex and have no business in a sitemap. */
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
  const [leagues, teams] = await Promise.all([
    api.listLeagues().catch(() => []),
    api.listTeams().catch(() => []),
  ]);
  const [matches, scorers] = await Promise.all([
    Promise.all(leagues.map((l) => api.listMatches(l.slug).catch(() => []))).then((m) => m.flat()),
    Promise.all(leagues.map((l) => api.listScorers(l.slug, { limit: 200 }).catch(() => []))).then((s) => s.flat()),
  ]);
  const grounds = new Set(teams.flatMap((t) => (t.home_field ? [t.home_field.slug] : [])));
  // Every pair that has met this season — the fixture people search as
  // "Κόνιτσα Ελεούσα" — once, under its canonical order.
  const pairs = new Set(
    matches
      .filter((m) => m.status === "finished")
      .map((m) => kontraPath(m.home_team.slug, m.away_team.slug)),
  );
  const players = new Set(scorers.filter((s) => (s.goals ?? 0) > 0).map((s) => s.player.slug));

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
    ...[...grounds].map((slug) => page(`/gipeda/${slug}`, 0.4, "monthly")),
    // A result is searched for the evening it happens and then for years by
    // the two villages; a fixture changes until it is played.
    ...matches.map((m) => ({
      ...page(`/agones/${m.id}`, m.status === "finished" ? 0.6 : 0.5, m.status === "finished" ? "monthly" : "daily"),
      lastModified: new Date(m.updated_at),
    })),
    ...[...players].map((slug) => page(`/paiktes/${slug}`, 0.3)),
    ...[...pairs].map((path) => page(path, 0.4)),
  ];
}
