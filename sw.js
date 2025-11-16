// Service Worker for Anno 117 Calculator
// Provides offline support and intelligent caching

const CACHE_NAME = 'anno117-calc-v1';
const DYNAMIC_CACHE = 'anno117-dynamic-v1';

// Critical assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style/theme.css',
    '/js/calculator.js',
    '/productions/list.json',
    '/style/logo_small.png',
    '/style/anno_icon.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[ServiceWorker] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
                        console.log('[ServiceWorker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip cross-origin requests
    if (url.origin !== location.origin) {
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Return cached response if available
            if (cachedResponse) {
                // For HTML and JSON, also fetch in background to update cache
                if (request.destination === 'document' || 
                    request.url.endsWith('.json')) {
                    // Update cache in background
                    event.waitUntil(
                        fetch(request).then((networkResponse) => {
                            if (networkResponse && networkResponse.status === 200) {
                                return caches.open(DYNAMIC_CACHE).then((cache) => {
                                    cache.put(request, networkResponse.clone());
                                });
                            }
                        }).catch(() => {
                            // Network failed, but we have cache
                        })
                    );
                }
                return cachedResponse;
            }

            // Not in cache, fetch from network
            return fetch(request).then((networkResponse) => {
                // Don't cache if response is not OK
                if (!networkResponse || networkResponse.status !== 200) {
                    return networkResponse;
                }

                // Cache production JSON files and images dynamically
                if (request.url.includes('/productions/') || 
                    request.url.includes('/icons/') ||
                    request.destination === 'image') {
                    const responseClone = networkResponse.clone();
                    caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }

                return networkResponse;
            }).catch(() => {
                // Network failed and no cache - return offline page or error
                if (request.destination === 'document') {
                    return new Response('Offline - please check your connection', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'text/plain'
                        })
                    });
                }
            });
        })
    );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            }).then(() => {
                event.ports[0].postMessage({ success: true });
            })
        );
    }
});
