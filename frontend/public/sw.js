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

/* --- Notifications ------------------------------------------------------
 *
 * The payload is encrypted to this browser and opened here. Everything is
 * guarded: a malformed push must still show something rather than nothing,
 * because a notification that silently fails looks like the feature not
 * working at all.
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Πάμε Σέντρα";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Collapses repeats: two goals in the same match replace each other
      // rather than stacking up a column of them.
      tag: data.url || "pamesentra",
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Reuse a tab that is already open rather than piling up new ones.
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate?.(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
