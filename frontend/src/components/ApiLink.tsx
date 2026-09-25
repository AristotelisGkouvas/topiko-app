"use client";

import { apiUrl } from "@/lib/api";

/** A link straight to an API file — a calendar, a feed.
 *
 *  Client-side because the tenant is read from the page (`<html
 *  data-association>`); a server-rendered href would name the default one.
 */
export function ApiLink({
  path,
  children,
  className,
}: {
  path: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={apiUrl(path)} className={className}>
      {children}
    </a>
  );
}
