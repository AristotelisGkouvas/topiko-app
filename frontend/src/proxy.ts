import { NextResponse, type NextRequest } from "next/server";

import { TENANT_HEADER, associationForHost } from "@/lib/tenant";

/** Resolves the ΕΠΣ from the host once, for everything the request renders.
 *
 *  The incoming header is overwritten, never trusted: a reader could send one
 *  of their own and be served another federation's pages under this host. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(TENANT_HEADER, associationForHost(request.headers.get("host")));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages and their images; not the build's static files or the service worker.
  matcher: ["/((?!_next/static|_next/image|sw.js|favicon|icon|apple-icon|manifest).*)"],
};
