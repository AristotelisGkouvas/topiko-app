/** The IndexNow key, served where the scraper's pings say it is.
 *
 *  Bing fetches this to confirm a ping came from whoever runs the site. Read
 *  at request time from the server's environment, so setting the key is a
 *  restart and not a rebuild; without one the file does not exist and the
 *  scraper sends nothing either. */
export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
