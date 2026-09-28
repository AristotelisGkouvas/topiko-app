/** Structured data for search engines: the schema.org JSON-LD that lets a
 *  result show "Τελικό 2–1" or a club's crest instead of a bare blue link. */

export const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const absolute = (path: string) => `${SITE}${path}`;

/** One address per pair of clubs. /kontra/a/b and /kontra/b/a show the same
 *  meetings from either side; left to themselves they compete for the same
 *  search, so both point at the alphabetical one. */
export function kontraPath(a: string, b: string): string {
  const [first, second] = [a, b].sort();
  return `/kontra/${first}/${second}`;
}

type Crumb = { name: string; path: string };

export function breadcrumbs(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absolute(c.path),
    })),
  };
}

/** `<` is escaped so a club called "</script>" — or anything scraped from
 *  the federation — cannot close the tag early. */
export function JsonLd({ data }: { data: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
