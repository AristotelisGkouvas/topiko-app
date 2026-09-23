/* The app shell, kept on the phone.
 *
 *  Narrow on purpose. This exists so that /diaxeirisi opens at a ground with
 *  no signal — the recording itself is made safe by the outbox, not by this.
 *  Caching more would mean serving a stale table to a reader who has a perfectly
 *  good connection, which is worse than a slow one.
 */

const CACHE = "pamesentra-shell-v1";
const SHELL = ["/diaxeirisi", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  // addAll fails the whole install if any one URL 404s, so each is added on
  // its own: a missing icon must not cost the offline screen.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ordinary page loads. API calls must never be served from a cache:
  // a stale score is a wrong score, and the outbox already handles being
  // unable to reach the network.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && new URL(request.url).pathname === "/diaxeirisi") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        return (
          cached ??
          (await caches.match("/diaxeirisi")) ??
          new Response("Χωρίς σύνδεση.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
  );
});
