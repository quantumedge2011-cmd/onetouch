const CACHE_NAME = 'one-touch-v3'; // Bumped to v3
const ASSETS = [
    './',
    './index.html',
    './privacy.html',
    './style.css',
    './js/app.js',
    './js/db.js',
    './js/sync.js',
    './js/modules/oracle.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip caching for massive AI assets (WebLLM/MLC)
    if (url.href.includes('mlc-ai') || url.href.includes('wasm') || url.href.includes('bin')) {
        return; // Network handles these directly
    }

    // Network-First for HTML, Cache-First for others
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match('./index.html'))
        );
    } else {
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});
