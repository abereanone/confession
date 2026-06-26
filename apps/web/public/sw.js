/* Confessions Hub service worker — install + offline support. */
// Bump SHELL_VERSION whenever the precached app shell changes; the old
// precache/runtime caches are then discarded and rebuilt on activate.
const SHELL_VERSION = "v2";
const PRECACHE = `confessions-precache-${SHELL_VERSION}`;
const RUNTIME = `confessions-runtime-${SHELL_VERSION}`;
// Bulk "download for offline" content lives here (written by the page via the
// Cache API). This is deliberately versioned separately from the app shell so
// bumping SHELL_VERSION never wipes a user's downloaded confessions/Bible.
// Keep this name in sync with AppInstall.astro's OFFLINE_CACHE.
const OFFLINE = "confessions-offline-v1";
const KEEP_CACHES = [PRECACHE, RUNTIME, OFFLINE];

/* App shell: cached on install so the app opens offline even on first launch. */
const PRECACHE_URLS = [
  "/",
  "/confessions",
  "/scriptures",
  "/bible/gen/1",
  "/offline.html",
  "/styles/theme.css",
  "/logo.png",
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

  // Offline manifest: always prefer the network so update checks see fresh
  // fingerprints, but keep a cached copy for offline removal/checks.
  if (url.pathname === "/offline-manifest.json") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Pages: network-first so online readers always get fresh content. Offline,
  // fall back to the exact cached page, then the precached homepage (so users
  // always land on a working, navigable app shell), then a friendly notice.
  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          const home = await caches.match("/");
          if (home) {
            return home;
          }
          return caches.match("/offline.html");
        })
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
