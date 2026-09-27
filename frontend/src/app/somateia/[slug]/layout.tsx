import { notFound } from "next/navigation";

import { ApiError, api } from "@/lib/api";

/** Answers "is there such a club" before anything streams.
 *
 *  The club page, its roster and its analysis all sit under a loading.tsx,
 *  and once that skeleton has been sent the status line has gone with it:
 *  notFound() in the page could only render the 404 content under a 200,
 *  which search engines index as a real page. A layout renders outside that
 *  boundary, so a 404 here is still a 404 on the wire. The page's own
 *  getTeam call is the same request and is served from the fetch cache.
 */
export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    await api.getTeam(slug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  return children;
}
