/**
 * Offline cache for 数字华容道 (PWA).
 *
 * Every asset is versioned by CACHE_NAME: bump it whenever any cached file
 * changes, otherwise clients keep serving the stale copy.
 *
 * Strategy:
 *   - install: pre-cache the whole app shell (it is tiny and fully static).
 *   - activate: drop caches from older versions.
 *   - fetch: cache-first for same-origin GETs, falling back to the network and
 *     then to the cached index.html for navigations, so the game opens offline.
 *
 * The app itself never needs the network, so a cache miss is the only case
 * where a request goes out at all.
 */
'use strict';

var CACHE_NAME = 'huarong-path-v2';

var PRECACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/puzzle.js',
  './js/layout.js',
  './js/scores.js',
  './js/main.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      // Activate this worker as soon as it finishes installing.
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE_NAME ? null : caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return; // leave third-party requests alone
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(request).then(function (response) {
        // Cache successful, basic responses so repeat visits work offline.
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function () {
        // Offline and not cached: serve the app shell for page navigations.
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw new Error('offline and not cached: ' + url.pathname);
      });
    })
  );
});
