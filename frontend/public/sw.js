/* Pages kept on the phone, for when the signal goes.
 *
 *  Network first, always. The cache is never preferred to a live answer, so a
 *  reader with a connection never sees a stale table — which was the original
 *  reason for keeping this to one page. What the cache is for is the other
 *  case: a ground behind a hill, where the alternative is the browser's own
 *  "no internet" screen and nothing at all.
 *
 *  A page served from here is genuinely old, and the app says so: the offline
 *  bar prints the time it was saved. That is the difference between showing
 *  somebody Saturday's score and lying to them about it.
 *
 *  API responses are still never cached. A stale score rendered as live is a
 *  wrong score, and the outbox — not this — is what makes recording safe.
 */

const CACHE = "pamesentra-pages-v2";
const SHELL = ["/", "/diaxeirisi", "/icon.svg", "/manifest.webmanifest"];

/** How many visited pages to keep. Enough for a Sunday's browsing; a cache
 *  that grows without limit gets evicted wholesale by the browser, which is
 *  the one moment it was needed. */
const MAX_PAGES = 30;

async function remember(request, response) {
  const cache = await caches.open(CACHE);
  await cache.put(request, response);

  // Oldest out. `keys()` returns insertion order, and a re-visited page is
  // re-inserted, so this evicts what has not been looked at in longest.
  const keys = await cache.keys();
  const pages = keys.filter((k) => !SHELL.includes(new URL(k.url).pathname));
  for (const stale of pages.slice(0, Math.max(0, pages.length - MAX_PAGES))) {
    await cache.delete(stale);
  }
}

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
        if (response.ok) {
          // Cloned before the body is read: a Response can only be consumed
          // once, and the reader gets the original.
          event.waitUntil(remember(request, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        // This page as it last was — not some other page's shell. Handing
        // somebody the dashboard because they asked for the fixtures is worse
        // than an error: it looks like the app lost their place.
        const cached = await caches.match(request, { ignoreSearch: false });
        if (cached) return cached;

        // Same page, different query string. A table filtered by matchday is
        // still that table, and it beats nothing.
        const loose = await caches.match(request, { ignoreSearch: true });
        if (loose) return loose;

        return (
          (await caches.match("/")) ??
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
