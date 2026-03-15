// Service Worker for Anno 117 Calculator
// Provides offline support and intelligent caching

const CACHE_VERSION = 'v3';
const STATIC_CACHE  = `anno117-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `anno117-dynamic-${CACHE_VERSION}`;
const ALL_CACHES    = [STATIC_CACHE, DYNAMIC_CACHE];

// Stable, known assets to pre-cache on install.
// Hashed JS/CSS bundles are NOT listed here — they are populated
// dynamically the first time the browser requests them.
const PRECACHE_ASSETS = [
    '/',
    '/assets/productions/list.json',
    '/assets/images/logo_small.png',
    '/assets/images/anno_icon.png',
    '/assets/data/manifest.json',
];

// ---------------------------------------------------------------------------
// URL classification helpers
// ---------------------------------------------------------------------------

/** Bun-generated bundles have a content hash in the filename, e.g. chunk-a1b2c3d4.js */
function isHashedBundle(url) {
    return /[.-][a-f0-9]{8,}\.(js|css)(\?.*)?$/.test(url.pathname);
}

function isProductionData(url) {
    return url.pathname.startsWith('/assets/productions/');
}

function isStaticMedia(url) {
    return url.pathname.startsWith('/assets/icons/')   ||
           url.pathname.startsWith('/assets/images/')  ||
           url.pathname.startsWith('/assets/fonts/')   ||
           /\.(png|webp|jpg|jpeg|svg|gif|woff2?|ttf|otf)$/i.test(url.pathname);
}

// ---------------------------------------------------------------------------
// Install — pre-cache stable assets
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ---------------------------------------------------------------------------
// Activate — evict obsolete caches
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(
                names
                    .filter((n) => !ALL_CACHES.includes(n))
                    .map((n) => {
                        console.log('[SW] Deleting old cache:', n);
                        return caches.delete(n);
                    })
            ))
            .then(() => self.clients.claim())
    );
});

// ---------------------------------------------------------------------------
// Fetch — per-resource caching strategy
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip cross-origin requests (e.g. analytics, fonts CDN)
    if (url.origin !== location.origin) return;

    if (request.destination === 'document') {
        // HTML: network-first so the app always gets the latest entry point
        // (and therefore the latest hashed bundle references).
        event.respondWith(networkFirst(request, STATIC_CACHE));
        return;
    }

    if (isHashedBundle(url)) {
        // Hashed JS/CSS: cache-first — content is immutable for a given hash.
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    if (isProductionData(url)) {
        // Production JSONs: stale-while-revalidate — show cached data
        // immediately while silently refreshing in the background.
        event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
        return;
    }

    if (isStaticMedia(url)) {
        // Icons, images, fonts: cache-first, populated on first use.
        event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
        return;
    }

    // Anything else (manifest, etc.): network-first.
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
});

// ---------------------------------------------------------------------------
// Strategy helpers
// ---------------------------------------------------------------------------

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
    }
    return response;
}

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;

        // Last resort offline fallback for navigation requests
        if (request.destination === 'document') {
            return new Response('<h1>Offline</h1><p>Please check your connection and try again.</p>', {
                status: 503,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
        }
        return new Response('Network error', { status: 503 });
    }
}

async function staleWhileRevalidate(request, cacheName) {
    const cache  = await caches.open(cacheName);
    const cached = await cache.match(request);

    const networkFetch = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    return cached ?? await networkFetch;
}

// ---------------------------------------------------------------------------
// Messages from the client
// ---------------------------------------------------------------------------

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data?.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then((names) => Promise.all(names.map((n) => caches.delete(n))))
                .then(() => event.ports[0]?.postMessage({ success: true }))
        );
    }
});
