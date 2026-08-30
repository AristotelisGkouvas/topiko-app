"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./SeasonPicker.module.css";

/** Season switcher, kept in the URL as ?periodos=.
 *
 *  A dropdown rather than the pill strip the leagues use: there are twelve
 *  seasons and one is picked rarely, so a row of twelve would cost more space
 *  than the whole standings header and still need sideways scrolling.
 */
export function SeasonPicker({
  seasons,
  active,
}: {
  seasons: { slug: string; name: string; is_current: boolean }[];
  /** undefined while the current season is showing, as the URL omits it then. */
  active: string | undefined;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (seasons.length < 2) return null;

  const current = seasons.find((s) => s.is_current);
  const selected = active ?? current?.slug ?? seasons[0].slug;

  const onChange = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    // The current season is the default, so leave it out and keep the URL
    // short — that is the link most people share.
    if (current && slug === current.slug) params.delete("periodos");
    else params.set("periodos", slug);
    // League and matchday belong to the season being left: slugs repeat across
    // seasons but ids do not, and the 14th αγωνιστική of 2016 is not the 14th
    // of today.
    params.delete("liga");
    params.delete("agonistiki");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <label className={styles.wrap}>
      <span className={styles.label}>Περίοδος</span>
      <select
        className={styles.select}
        value={selected}
        onChange={(event) => onChange(event.target.value)}
      >
        {seasons.map((season) => (
          <option key={season.slug} value={season.slug}>
            {season.slug}
            {season.is_current ? " (τρέχουσα)" : ""}
          </option>
        ))}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        ⌄
      </span>
    </label>
  );
}
