/** Which ΕΠΣ a request is for.
 *
 *  The backend is tenant-scoped by URL, but the reader-facing URLs are not:
 *  pamesentra.gr/vathmologia reads better than
 *  pamesentra.gr/epsip-ipeirou/vathmologia. So the tenant comes from the host
 *  the reader typed, resolved once per request in `proxy.ts` and handed on:
 *
 *  - to server code as a request header (`TENANT_HEADER`), read in `api.ts`;
 *  - to the browser as `<html data-association>`, set by the layout.
 *
 *  A deployment that serves one ΕΠΣ needs none of this configured: every host
 *  falls through to NEXT_PUBLIC_ASSOCIATION.
 */

export const DEFAULT_ASSOCIATION =
  process.env.NEXT_PUBLIC_ASSOCIATION ?? "epsip-ipeirou";

export const TENANT_HEADER = "x-pamesentra-association";

/** Slugs are lower-case letters, digits and hyphens. Anything else in the
 *  header did not come from us. */
const SLUG = /^[a-z0-9-]{2,64}$/;

/** `ASSOCIATION_HOSTS="epsip.pamesentra.gr=epsip-ipeirou,epsa.pamesentra.gr=epsa"`
 *  → the slug for this host, or the default. The port is ignored. */
export function associationForHost(
  host: string | null | undefined,
  mapping: string | undefined = process.env.ASSOCIATION_HOSTS,
): string {
  const name = (host ?? "").toLowerCase().replace(/:\d+$/, "");
  for (const pair of (mapping ?? "").split(",")) {
    const [key, slug] = pair.split("=").map((part) => part.trim().toLowerCase());
    if (key && slug && key === name && SLUG.test(slug)) return slug;
  }
  return DEFAULT_ASSOCIATION;
}

export function isAssociationSlug(value: string | null | undefined): value is string {
  return !!value && SLUG.test(value);
}
