"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import styles from "./SelectNav.module.css";

/** A small dropdown that filters the page through one query parameter —
 *  "Όλες οι κατηγορίες ⌄" — and leaves the others alone. */
export function SelectNav({
  param,
  value,
  options,
  label,
  reset = [],
}: {
  param: string;
  value: string;
  /** The first option, with value "", is "all". */
  options: { value: string; label: string }[];
  label: string;
  /** Other parameters that stop making sense when this one changes. */
  reset?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className={styles.wrap}>
      <span className="srOnly">{label}</span>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) params.set(param, e.target.value);
          else params.delete(param);
          for (const r of reset) params.delete(r);
          const q = params.toString();
          router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        ⌄
      </span>
    </label>
  );
}
