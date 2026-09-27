"use client";

import { useEffect } from "react";

import { track, type AnalyticsEventName } from "@/lib/analytics";

/** Reports one event when a server-rendered page is shown, e.g. a 404. */
export function TrackOnMount({ name }: { name: AnalyticsEventName }) {
  useEffect(() => {
    track(name, { path: location.pathname });
  }, [name]);
  return null;
}
