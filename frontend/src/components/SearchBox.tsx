"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "./SearchBox.module.css";

/** Filter box for the long catalogue pages, kept in the URL as ?anazitisi=.
 *
 *  The register holds 172 clubs and 114 grounds. Alphabetical order alone
 *  means finding one is a scroll through everything before it.
 *
 *  Typing does not navigate on every keystroke: the request is debounced and
 *  the history entry replaced, so the back button leaves the page rather than
 *  walking back through each letter that was typed.
 */
export function SearchBox({
  placeholder,
  label,
}: {
  placeholder: string;
  label: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("anazitisi") ?? "";
  const [value, setValue] = useState(fromUrl);
  const typed = useRef(false);

  // Follow the URL when it changes from elsewhere — a cleared filter, the back
  // button — but never fight the field while somebody is typing in it.
  useEffect(() => {
    if (!typed.current) setValue(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    if (!typed.current) return;
    const id = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set("anazitisi", value.trim());
      else params.delete("anazitisi");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }, 250);
    return () => clearTimeout(id);
  }, [value, pathname, router, searchParams]);

  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        className={styles.input}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => {
          typed.current = true;
          setValue(event.target.value);
        }}
      />
    </div>
  );
}
