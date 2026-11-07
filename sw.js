/* Lu’s Lounge service worker: makes the app installable, loads fast, and shows lock-screen alerts. */
const CACHE = "nightshop-shell-32";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
// network first (so updates arrive right away), cached copy only when offline
self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    } catch (e) {
      const hit = await caches.match(req, { ignoreSearch: false }) || await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw e;
    }
  })());
});

// a push from the server: deliberately generic text, since lock screens are visible to others
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Lu’s Lounge";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "You have a new alert.",
    icon: "icons/icon-192.png",
    badge: "icons/badge-72.png",
    tag: data.tag || "nightshop",
    renotify: true,
    data: { go: data.go || "" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const go = (event.notification.data && event.notification.data.go) || "";
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) {
      await open.focus();
      open.postMessage({ type: "nightshop-go", go });
    } else {
      await self.clients.openWindow("./index.html" + (go ? "?go=" + encodeURIComponent(go) : ""));
    }
  })());
});
