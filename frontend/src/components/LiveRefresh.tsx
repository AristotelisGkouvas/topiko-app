"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders a server page on a timer while its match is being played.
 *
 *  The match page's hero is server-rendered; only the ticker polled, so the
 *  big score at the top stayed on whatever it was when the page opened. */
export function LiveRefresh({ every = 20_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      // Not while hidden: a phone in a pocket should not be fetching.
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => window.clearInterval(timer);
  }, [router, every]);
  return null;
}
