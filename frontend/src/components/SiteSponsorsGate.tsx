"use client";

import { usePathname } from "next/navigation";

/** Not on the admin panel, which is a tool, not in the embed, which lives
 *  inside somebody else's site, and not under the full-screen welcome. The
 *  layout cannot see the path; this can. */
export function SiteSponsorsGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/admin") || path.startsWith("/embed") || path.startsWith("/kalosorisma")) return null;
  return <>{children}</>;
}
