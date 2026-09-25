"use client";

import { SWRConfig } from "swr";

import { jsonFetcher } from "@/lib/api";

/** One set of rules for every poll on the site.
 *
 *  Several components poll the same endpoints (the live strip, the table, the
 *  ticker). With a shared config the same key is fetched once and shared
 *  between them, rather than each one asking on its own clock.
 *
 *  Hidden tabs do not poll at all — SWR's `refreshWhenHidden` is off by
 *  default — so a reader with the site open in five tabs costs one tab's worth
 *  of requests. That is why there is no cross-tab channel here: the tab that
 *  is looked at is the one that asks.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: jsonFetcher,
        // Two components mounting together ask once.
        dedupingInterval: 5_000,
        // Switching back and forth between apps should not be a request each.
        focusThrottleInterval: 10_000,
        // A dead API is retried a few times, not for ever on a phone battery.
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
