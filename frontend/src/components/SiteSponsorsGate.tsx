"use client";

import { usePathname } from "next/navigation";

/** Not on the admin panel, which is a tool, and not in the embed, which lives
 *  inside somebody else's site. The layout cannot see the path; this can. */
export function SiteSponsorsGate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/admin") || path.startsWith("/embed")) return null;
  return <>{children}</>;
}
