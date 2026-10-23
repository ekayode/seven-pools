// Offline support: app files are cached on install; fonts are cached the first time they load.
// Bump VERSION whenever you change any app file so phones pick up the update.
const VERSION = "sp-v1";
const APP = ["./", "index.html", "styles.css", "app.js", "content/days.json", "manifest.webmanifest",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
