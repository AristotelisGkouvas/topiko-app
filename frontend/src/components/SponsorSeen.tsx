"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { apiUrl } from "@/lib/api";

/** Counts one view for each sponsor inside it, the first time at least half
 *  of it is on screen — not on page load: a strip at the foot of a page
 *  nobody scrolled to was not seen, and a sponsor paying for views should
 *  not be sold ones that did not happen. Once per page view; no cookies, no
 *  reader id.
 */
export function SponsorSeen({
  platform = [],
  club = [],
  className,
  children,
}: {
  platform?: number[];
  club?: number[];
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The page as well as the sponsors: the strip at the foot of every page
  // lives in the layout, which stays mounted from page to page, so without
  // the path it counted once per visit instead of once per page viewed.
  const path = usePathname();
  // A string, so the effect re-runs only when the set of sponsors changes and
  // not on every render that builds a new array.
  const key = `${platform.join(",")}|${club.join(",")}`;

  useEffect(() => {
    const node = ref.current;
    if (!node || key === "|") return;
    const [p, c] = key.split("|").map((part) => (part ? part.split(",").map(Number) : []));
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        // keepalive: the reader may already be tapping the next link.
        fetch(apiUrl("/sponsors/views"), {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: p, club: c }),
        }).catch(() => {
          // A lost count is not worth an error on the reader's screen.
        });
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [key, path]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
