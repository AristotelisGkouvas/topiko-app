"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";

import { apiUrl } from "@/lib/api";
import { post, track, trackingAllowed } from "@/lib/analytics";

/** Stable, so Next reports each metric once (see useReportWebVitals docs). */
function reportVital(metric: { name: string; value: number }) {
  track("vital", { name: metric.name, value: Math.round(metric.value * 1000) / 1000 });
}

/** Anonymous page statistics: one view per page shown, and when the reader
 *  leaves it, how long it was open and how far down they read. Plus client
 *  errors and Core Web Vitals. No cookies, no storage, no identifiers — see
 *  backend/app/models/analytics.py for what the server keeps. */
export function Analytics() {
  const path = usePathname();
  const search = useSearchParams();
  const url = `${path}${search.size ? `?${search.toString()}` : ""}`;
  const view = useRef<{ id: number | null; started: number; scroll: number } | null>(null);

  useReportWebVitals(reportVital);

  // One view per page; the previous page's time and depth sent as it goes.
  useEffect(() => {
    if (!trackingAllowed() || path.startsWith("/admin")) return;
    const current = { id: null as number | null, started: Date.now(), scroll: 0 };
    view.current = current;
    const referrer = document.referrer || null;
    void post("/analytics/view", {
      url,
      referrer,
      viewport_width: window.innerWidth,
      dark:
        document.documentElement.dataset.theme === "dark" ||
        (!document.documentElement.dataset.theme &&
          window.matchMedia("(prefers-color-scheme: dark)").matches),
      installed: window.matchMedia("(display-mode: standalone)").matches,
      lang: navigator.language,
    })
      .then((r) => r?.json())
      .then((data: { id: number | null } | undefined) => {
        current.id = data?.id ?? null;
      })
      .catch(() => {});

    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 100;
      if (pct > current.scroll) current.scroll = Math.min(100, pct);
    };
    const leave = () => {
      if (current.id === null) return;
      void post("/analytics/leave", {
        id: current.id,
        duration_ms: Math.min(Date.now() - current.started, 6 * 60 * 60 * 1000),
        scroll_pct: current.scroll,
      });
      current.id = null; // once
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", leave);
    return () => {
      leave();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", leave);
    };
  }, [url, path]);

  // Clicks, delegated: an element carrying data-track="name" (and, if it
  // has any, data-track-props='{"k":"v"}') reports that action, so server
  // components can be counted without becoming client ones. Links off the
  // site count as "outbound" — except sponsors', which count themselves.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const tagged = target?.closest<HTMLElement>("[data-track]");
      if (tagged) {
        let props: Record<string, string | number | boolean | null> | undefined;
        try {
          props = tagged.dataset.trackProps ? JSON.parse(tagged.dataset.trackProps) : undefined;
        } catch {
          props = undefined;
        }
        track(tagged.dataset.track as Parameters<typeof track>[0], props);
        return;
      }
      const link = target?.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      try {
        const to = new URL(link.href, location.href);
        const api = new URL(apiUrl(""), location.href);
        if (to.origin === location.origin || to.origin === api.origin) return;
        track("outbound", { host: to.hostname });
      } catch {
        // A malformed href is not worth a report.
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // Client errors, a few per page at most: the ones readers actually hit.
  useEffect(() => {
    let sent = 0;
    const report = (message: string) => {
      if (sent++ >= 5) return;
      track("js_error", { message: message.slice(0, 200) });
    };
    const onError = (e: ErrorEvent) => report(e.message || "error");
    const onRejection = (e: PromiseRejectionEvent) =>
      report(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
