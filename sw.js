// Offline support. App files: network first (so updates show on the next open), cache when offline.
// Fonts: cache first, saved the first time they load.
// Bump VERSION whenever you change any app file so phones refresh their saved copy.
const VERSION = "sp-v9";
const APP = ["./", "index.html", "styles.css", "app.js", "content/days.json", "manifest.webmanifest",
  "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png"];
const fresh = u => new Request(u, { cache: "reload" }); // skips the browser's HTTP cache, which can still hold the previous version

// The voice recordings listed in audio/clips.json, so every day's voice works offline.
async function audioFiles() {
  try {
    const res = await fetch(fresh("audio/clips.json"));
    if (!res.ok) return [];
    return ["audio/clips.json", ...Object.values((await res.json()).clips).map(c => "audio/" + c.file)];
  } catch { return []; }
}

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION)
    .then(async c => { await c.addAll(APP.map(fresh)); await c.addAll((await audioFiles()).map(fresh)).catch(() => {}); })
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function save(req, res) {
  if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
  return res;
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin === location.origin) {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(res => save(req, res))
      .catch(() => caches.match(req, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => save(req, res))));
  }
});
