/* Confessions Hub service worker — install + offline support. */
// Bump SHELL_VERSION whenever the precached app shell changes; the old
// precache/runtime caches are then discarded and rebuilt on activate.
const SHELL_VERSION = "v10";
const PRECACHE = `confessions-precache-${SHELL_VERSION}`;
// HTML picked up while browsing. Versioned: pages live at stable URLs, so a
// stale copy really is stale and should go when the shell changes.
const RUNTIME = `confessions-pages-${SHELL_VERSION}`;
// Astro's CSS/JS carry a content hash in the filename, so an entry here can
// never be stale — a changed file is a different URL. Deliberately NOT
// versioned: this cache holds the styles and scripts that every downloaded
// page depends on, and versioning it meant bumping SHELL_VERSION silently
// stripped downloaded confessions/Bible chapters of their CSS and JS until the
// reader went back online.
const ASSETS = "confessions-assets";
// Bulk "download for offline" content lives here (written by the page via the
// Cache API). This is deliberately versioned separately from the app shell so
// bumping SHELL_VERSION never wipes a user's downloaded confessions/Bible.
// Keep this name in sync with AppInstall.astro's OFFLINE_CACHE.
const OFFLINE = "confessions-offline-v1";
const KEEP_CACHES = [PRECACHE, RUNTIME, ASSETS, OFFLINE];

/* App shell: cached on install so the app opens offline even on first launch. */
const PRECACHE_URLS = [
  "/",
  "/scriptures",
  // The header "Bible" link resumes via /bible, so the shell must open offline.
  "/bible",
  "/bible/bookmarks",
  "/bible/gen/1",
  "/offline.html",
  "/styles/theme.css",
  "/logo.svg",
  "/lockup.svg",
  "/favicon.svg",
  "/site.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

/**
 * Stores one page under the exact URL the site's links request.
 *
 * `cache.add()` cannot be used: the host 308-redirects `/bible/gen/1` to
 * `/bible/gen/1/`, add() follows that redirect, and `cache.put()` then rejects
 * a redirected response outright. Every page in PRECACHE_URLS therefore failed
 * to store, silently, because the rejection was swallowed — which is why the
 * app fell back to the home page for everything offline. Re-wrapping the body
 * as a plain 200 keys it under the non-slash URL that links navigate to.
 *
 * When `assets` is given, the stylesheets and scripts the page references are
 * added to it, so they can be stored too (see cacheAssets).
 * Keep in sync with cachePage() in AppInstall.astro.
 */
const ASSET_IN_HTML = /(?:href|src)="(\/[^"]+?\.(?:css|js)(?:\?[^"]*)?)"/g;
const IMPORT_IN_JS = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+?\.js)["']/g;

const cachePage = async (cache, url, assets) => {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  const isHtml = (response.headers.get("content-type") || "").includes("text/html");
  const body = isHtml ? await response.text() : await response.blob();
  if (isHtml && assets) {
    for (const match of body.matchAll(ASSET_IN_HTML)) {
      assets.add(match[1]);
    }
  }
  const headers = new Headers(response.headers);
  // The body is already decoded; carrying these over would describe it wrongly.
  headers.delete("content-encoding");
  headers.delete("content-length");
  await cache.put(
    new Request(url),
    new Response(body, { status: 200, statusText: "OK", headers })
  );
};

/**
 * Stores page assets plus every script chunk they import. A cached page whose
 * stylesheet and scripts are missing opens offline unstyled and inert, and
 * those were only ever stored if the reader had opened that kind of page online.
 * Keep in sync with cacheAssets() in AppInstall.astro.
 */
const cacheAssets = async (cache, assets) => {
  const queue = [...assets];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const url = queue.shift();
    try {
      if (await cache.match(url)) {
        continue;
      }
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) {
        continue;
      }
      if (url.split("?")[0].endsWith(".js")) {
        const source = await response.clone().text();
        for (const match of source.matchAll(IMPORT_IN_JS)) {
          const chunk = new URL(match[1], new URL(url, self.location.origin)).pathname;
          if (!seen.has(chunk)) {
            seen.add(chunk);
            queue.push(chunk);
          }
        }
      }
      await cache.put(new Request(url), response);
    } catch {
      // Best effort: a miss here is retried the next time the page is opened online.
    }
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      const assets = new Set();
      // Tolerate individual misses so one bad URL doesn't fail the whole install.
      await Promise.all(PRECACHE_URLS.map((url) => cachePage(cache, url, assets).catch(() => {})));
      // Hashed bundles go in the unversioned asset cache, like any other asset.
      await cacheAssets(await caches.open(ASSETS), assets);
      await self.skipWaiting();
    })()
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

/** `/bible/gen/1` <-> `/bible/gen/1/`; null for the root, which has no variant. */
const withAlternateSlash = (url) => {
  const alternate = new URL(url);
  if (alternate.pathname === "/") {
    return null;
  }
  alternate.pathname = alternate.pathname.endsWith("/")
    ? alternate.pathname.slice(0, -1)
    : `${alternate.pathname}/`;
  return alternate.toString();
};

/**
 * Finds a cached page, tolerating the two ways a URL can differ from its key.
 *
 * `ignoreSearch`, because pages are cached under bare paths but the reader
 * navigates with query strings — `?resume=1` from the resume redirect,
 * `?scope=nt` from the testament pills, `?ref=` from confession proof texts,
 * `?q=` from search. The params are read client-side from location.search,
 * which this does not touch, and the static HTML is identical either way.
 *
 * The slash variant, because the host's 308 cannot run offline: a link to
 * `/bible/gen/1` must still find a copy stored as `/bible/gen/1/`.
 */
const matchCachedPage = async (request) => {
  const exact = await caches.match(request, { ignoreSearch: true });
  if (exact) {
    return exact;
  }
  const alternate = withAlternateSlash(request.url);
  return alternate ? caches.match(alternate, { ignoreSearch: true }) : undefined;
};

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
          const cached = await matchCachedPage(request);
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

  // Assets (CSS/JS/JSON/images/fonts): stale-while-revalidate, into the
  // unversioned asset cache so downloaded pages keep working across updates.
  // ignoreVary: module scripts are requested with an Origin header the stored
  // request lacks, and a host that answers with `Vary: Origin` would otherwise
  // make every cached script a miss offline. Assets are content-hashed, so the
  // varying headers cannot change what is served.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          // The offline download fetches pages without a text/html Accept header,
          // so they arrive here; it stores them itself, and keeping a second
          // copy in this cache doubled the space a download takes.
          const isHtml = (response.headers.get("content-type") || "").includes("text/html");
          if (response.ok && !isHtml) {
            const copy = response.clone();
            caches.open(ASSETS).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        // Offline with nothing cached: answer with a real network error rather
        // than `undefined`, which respondWith rejects as a TypeError and which
        // shows up in devtools as an unhandled SW error instead of a failed asset.
        // The stylesheet is requested as /styles/theme.css?v=<hash> but precached
        // bare, so ignore the query when offline.
        .catch(async () => cached || (await caches.match(request, { ignoreSearch: true, ignoreVary: true })) || Response.error());
      return cached || network;
    })
  );
});

/* Optional bulk caching hook (used by a future "Download for offline" button). */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(RUNTIME);
        const assets = new Set();
        // cachePage, not cache.add, for the redirect reason described above.
        await Promise.all(data.urls.map((url) => cachePage(cache, url, assets).catch(() => {})));
        await cacheAssets(await caches.open(ASSETS), assets);
      })()
    );
  }
});
