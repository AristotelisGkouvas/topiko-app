"use client";

import { useEffect } from "react";

/** Registers the shell cache.
 *
 *  Only in production: a worker that has cached a development build serves it
 *  back after the next change, which looks exactly like the change not
 *  working.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    // Registered after load, so it never competes with the first render for
    // bandwidth on the connection this is meant to help with.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Blocked, unsupported, or an insecure origin. The site works without
        // it; only the offline screen is lost.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
