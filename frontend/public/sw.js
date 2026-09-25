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

const CACHE = "pamesentra-pages-v4";
// The dashboard is not here: it is useless without the API, and an editor
// with no signal is better told so than shown a login form that cannot work.
const SHELL = ["/", "/icon.svg", "/manifest.webmanifest"];

/** The build's scripts and styles. A cached page is only half a page without
 *  them — it paints, but never hydrates, so nothing on it responds. Their
 *  names carry a content hash, so a cached copy can never be a stale one and
 *  they are safe to serve cache-first. */
const STATIC = "pamesentra-static-v1";
const MAX_STATIC = 200;

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
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== STATIC)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function staticAsset(request) {
  const cache = await caches.open(STATIC);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    // Old builds' files pile up otherwise. Insertion order again, so the
    // oldest build goes first.
    const keys = await cache.keys();
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) {
      await cache.delete(stale);
    }
  }
  return response;
}

/** How long to wait for the network before showing the saved copy. With one
 *  bar of signal a request neither succeeds nor fails — it hangs until the
 *  browser gives up, and the reader stares at a white screen while the page
 *  they want is sitting in the cache. */
const NETWORK_PATIENCE_MS = 4000;

async function saved(request) {
  // This page as it last was — not some other page's shell. Handing somebody
  // the dashboard because they asked for the fixtures is worse than an error:
  // it looks like the app lost their place.
  const exact = await caches.match(request, { ignoreSearch: false });
  if (exact) return exact;
  // Same page, different query string. A table filtered by matchday is still
  // that table, and it beats nothing.
  return caches.match(request, { ignoreSearch: true });
}

async function page(event, request) {
  const network = fetch(request).then((response) => {
    if (response.ok) {
      // Cloned before the body is read: a Response can only be consumed
      // once, and the reader gets the original.
      event.waitUntil(remember(request, response.clone()));
    }
    return response;
  });
  // Whatever happens below, a slow answer still lands in the cache.
  event.waitUntil(network.catch(() => undefined));

  const slow = new Promise((resolve) =>
    setTimeout(() => resolve("slow"), NETWORK_PATIENCE_MS),
  );
  try {
    const first = await Promise.race([network, slow]);
    if (first !== "slow") return first;
    // Still waiting. Show the saved copy if there is one; if not, keep
    // waiting — a late page is better than none.
    return (await saved(request)) ?? (await network);
  } catch {
    return (await saved(request)) ?? notSaved();
  }
}

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Greek slugs read as Greek, not as %CE%B1. */
function readable(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Offline, and this page was never opened here. Says so, and offers the
 *  pages that are saved — rather than the home page under this URL, which
 *  looked like the site had lost the reader's place. */
async function notSaved() {
  const cache = await caches.open(CACHE);
  const pages = (await cache.keys())
    .map((request) => new URL(request.url))
    .filter((url) => !SHELL.slice(1).includes(url.pathname))
    .map((url) => url.pathname + url.search);
  const links = [...new Set(pages)]
    .map((path) => `<li><a href="${escapeHtml(path)}">${escapeHtml(readable(path))}</a></li>`)
    .join("");
  const html = `<!doctype html><html lang="el"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Χωρίς σύνδεση · Πάμε Σέντρα</title>
<style>body{font:1rem/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;background:#f5f5f5;color:#1b2631}
@media (prefers-color-scheme:dark){body{background:#0b1622;color:#e4e8ec}a{color:#9cb6ce}}
h1{font-size:1.25rem}a{display:inline-block;padding:10px 0;color:#003c71}</style></head>
<body><h1>Χωρίς σύνδεση</h1>
<p>Αυτή η σελίδα δεν έχει αποθηκευτεί στο κινητό. Θα ανοίξει μόλις επανέλθει το σήμα.</p>
${links ? `<p>Αποθηκευμένες σελίδες:</p><ul>${links}</ul>` : ""}
</body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  const url = new URL(request.url);
  if (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(staticAsset(request));
    return;
  }

  // Only ordinary page loads. API calls must never be served from a cache:
  // a stale score is a wrong score, and the outbox already handles being
  // unable to reach the network.
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(page(event, request));
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
