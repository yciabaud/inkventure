/*
 * Service Worker of the offline probe (story S0.9). Plain ES5 like the rest of the probe.
 * It caches the probe page itself so that it can be reloaded with the network off, and nothing else: its scope is
 * /probe/offline/, so it never touches the app.
 */
'use strict';

var SHELL_CACHE = 'ik-probe-offline-shell-v1';
var SHELL = ['./', 'index.html', 'offline.js', '../qrcode.js'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  // Other origins (the IF Archive) are left to the browser.
  if (request.method !== 'GET' || request.url.indexOf(self.location.origin + '/') !== 0) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then(function (cached) {
      return cached || fetch(request);
    })
  );
});
