/* Le Grand Tour service worker — conservative offline support.
 *
 * Strategy:
 *  - Navigations to the root app: NETWORK-FIRST, falling back to the cached shell.
 *    This guarantees an online visitor always gets the freshest HTML (no stale-app
 *    trap while the trip is live), but the app still opens offline.
 *  - Navigations to the sibling apps (/app/, /voyage/) are left entirely on the
 *    network — this worker does not manage them.
 *  - Other GET requests (CDN libraries, map tiles, journal photos, fonts, hero
 *    images): STALE-WHILE-REVALIDATE, so anything viewed once is available offline
 *    and updates quietly in the background.
 *
 * Bump VERSION to roll the cache.
 */
const VERSION = "lgt-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then((c) => c.add(new Request("./", { cache: "reload" })).catch(() => {}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Page loads: network-first with a cached-shell fallback.
  if (req.mode === "navigate") {
    // Leave the other apps in this repo on the network entirely.
    if (url.origin === self.location.origin && /\/(app|voyage)\//.test(url.pathname)) return;
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(VERSION);
        c.put("./", fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        const cached = await caches.match("./");
        return cached || Response.error();
      }
    })());
    return;
  }

  // Everything else: serve from cache fast, refresh in the background.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      try { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); } catch (_) {}
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
