/* Confessions Hub service worker — install + offline support. */
const VERSION = "v1";
const PRECACHE = `confessions-precache-${VERSION}`;
const RUNTIME = `confessions-runtime-${VERSION}`;
// Bulk "download for offline" content lives here (written by the page via the
// Cache API). Keep this name in sync with AppInstall.astro's OFFLINE_CACHE.
const OFFLINE = `confessions-offline-${VERSION}`;
const KEEP_CACHES = [PRECACHE, RUNTIME, OFFLINE];

/* App shell: cached on install so the app opens offline even on first launch. */
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/styles/theme.css",
  "/site.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      // Tolerate individual misses so one bad URL doesn't fail the whole install.
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("confessions-") && !KEEP_CACHES.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const isHtmlRequest = (request) =>
  request.mode === "navigate" ||
  (request.headers.get("accept") || "").includes("text/html");

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  // Only handle our own origin; let analytics, fonts, etc. pass through untouched.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Pages: network-first so online readers always get fresh content,
  // falling back to the cached page, then a friendly offline page.
  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline.html"))
        )
    );
    return;
  }

  // Assets (CSS/JS/JSON/images/fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

/* Optional bulk caching hook (used by a future "Download for offline" button). */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(RUNTIME).then((cache) =>
        Promise.all(data.urls.map((url) => cache.add(url).catch(() => {})))
      )
    );
  }
});
