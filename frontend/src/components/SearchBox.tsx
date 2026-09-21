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
  //: The filter this box last put in the URL. Comparing against it is what
  //: separates a change made elsewhere from the echo of our own replace() —
  //: a flag saying "somebody has typed" cannot, and once it was set the box
  //: stopped following the back button for the rest of the visit.
  const pushed = useRef(fromUrl);

  useEffect(() => {
    if (fromUrl === pushed.current) return;
    pushed.current = fromUrl;
    setValue(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    const wanted = value.trim();
    if (wanted === pushed.current) return;
    const id = setTimeout(() => {
      pushed.current = wanted;
      const params = new URLSearchParams(searchParams.toString());
      if (wanted) params.set("anazitisi", wanted);
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
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}
