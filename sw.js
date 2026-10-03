/*
 * The app's Service Worker (SPEC §6.2; story S5.3). Plain ES5, like the probe's. The build (scripts/build/
 * service-worker.ts) writes it to dist/sw.js with this build's precache list in place of the placeholder below.
 *
 * - The shell is cached when the worker installs, in a cache named after the build; the previous build's cache is
 *   dropped when it activates. The page and its files are served from that cache first, so the app opens with Wi-Fi
 *   off; online, a new build is installed in the background and used from the next launch.
 * - Each engine's chunks are cached for the formats of the adventures kept offline: listed in the kept cache's
 *   `kept/index.json` at install, and sent by the page (`{type: 'engines', kinds}`) when one is kept.
 * Anything else (the catalogue, covers, game files, other pages of the site such as previews) is left to the browser;
 * the page reads kept adventures from their own cache itself (src/storage/keptFiles.ts), which no build drops.
 */
'use strict';

var PRECACHE = {"version":"35768bcdd40b","shell":["./","assets/OfflinePage-legacy-BKeYjIkq.js","assets/OfflinePage-woEV9hWW.js","assets/browser-DH-x7Nlt.js","assets/browser-legacy-DirU_-IH.js","assets/compress-BDIPL8D6.js","assets/compress-legacy-DSipa26g.js","assets/demoStory-DGyMzWPq.js","assets/demoStory-legacy-qKhzVnMk.js","assets/fr-BVQCXvnx.js","assets/fr-legacy-D1oteFvY.js","assets/index-BXYAKHvI.css","assets/index-CavvUTmh.js","assets/index-legacy-BrnBGm5T.js","assets/offline-BdwGA--V.js","assets/offline-legacy-CdK1kkRn.js","assets/polyfills-legacy-Dy4HaTfd.js","assets/saves-8fBt8UTK.js","assets/saves-legacy-BKWpjPdL.js","assets/storyFile-BFhONrBu.js","assets/storyFile-legacy-B0T__lyH.js","assets/twine-D3RaIKut.js","assets/twine-legacy-CwWTiVBy.js","assets/literata-latin-400-normal-CLtNJ872.woff2","assets/literata-latin-400-normal-CUhpYSl8.woff","assets/literata-latin-700-normal-DYBWKELl.woff2","assets/literata-latin-700-normal-ocJiFfAw.woff","assets/source-sans-3-latin-400-normal-AFMiCETP.woff","assets/source-sans-3-latin-400-normal-DQi5PRDE.woff2"],"engines":{"glulx":["assets/bridge-YLsYmvIq.js","assets/bridge-legacy-C5KeaToy.js","assets/quixeEngine-CLo93YCB.js","assets/quixeEngine-legacy-BmLJM4hd.js"],"ink":["assets/inkEngine-2qu10O-R.js","assets/inkEngine-legacy-D4u0PY0l.js"],"twine":["assets/TwineReader-CYuSj2N8.js","assets/TwineReader-legacy-BI9IQexV.js","assets/twineHtml-CtpjQZ2y.js","assets/twineHtml-legacy-LffXzC4u.js"],"zmachine":["assets/bridge-YLsYmvIq.js","assets/bridge-legacy-C5KeaToy.js","assets/zvmEngine-ChopH5Tr.js","assets/zvmEngine-legacy-BiS_KrfA.js"]}};
var APP_PREFIX = 'inkventure-app-';
var APP_CACHE = APP_PREFIX + PRECACHE.version;
var KEPT_CACHE = 'inkventure-kept';
var SCOPE = self.registration.scope;

function absolute(path) {
  return new URL(path, SCOPE).href;
}

/** Every file this build can serve, by absolute URL. */
var KNOWN = {};
(function () {
  var lists = [PRECACHE.shell];
  for (var kind in PRECACHE.engines) lists.push(PRECACHE.engines[kind]);
  for (var i = 0; i < lists.length; i++) {
    for (var j = 0; j < lists[i].length; j++) KNOWN[absolute(lists[i][j])] = true;
  }
})();

/** The engine files of `kinds` (unknown kinds are skipped). */
function engineFiles(kinds) {
  var files = [];
  for (var i = 0; i < kinds.length; i++) {
    var list = PRECACHE.engines[kinds[i]] || [];
    for (var j = 0; j < list.length; j++) files.push(list[j]);
  }
  return files;
}

/** The engines of the kept adventures, from the kept cache (none when it is empty or unreadable). */
function keptKinds() {
  return caches
    .open(KEPT_CACHE)
    .then(function (cache) {
      return cache.match(SCOPE + 'kept/index.json');
    })
    .then(function (response) {
      return response ? response.json() : { kinds: [] };
    })
    .then(
      function (index) {
        return index && index.kinds instanceof Array ? index.kinds : [];
      },
      function () {
        return [];
      }
    );
}

/**
 * Caches `paths` that are not in `cache` yet. Built files have their hash in their name, so one the previous build
 * cached is copied from there; the page (`./`) and the rest come fresh from the network, not from the HTTP cache.
 */
function cacheMissing(cache, paths) {
  return Promise.all(
    paths.map(function (path) {
      var url = absolute(path);
      return cache.match(url).then(function (hit) {
        if (hit) return undefined;
        var earlier = path === './' ? Promise.resolve(undefined) : caches.match(url);
        return earlier.then(function (copy) {
          if (copy) return cache.put(url, copy);
          return fetch(new Request(url, { cache: 'no-cache' })).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
            return cache.put(url, response);
          });
        });
      });
    })
  );
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    Promise.all([caches.open(APP_CACHE), keptKinds()])
      .then(function (results) {
        return cacheMissing(results[0], PRECACHE.shell.concat(engineFiles(results[1])));
      })
      .then(function () {
        // Taken over at once: the page already running keeps its files in memory, the next launch gets this build.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) {
              return name.indexOf(APP_PREFIX) === 0 && name !== APP_CACHE;
            })
            .map(function (name) {
              return caches.delete(name);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type !== 'engines' || !(data.kinds instanceof Array)) return;
  var port = event.ports && event.ports[0];
  var done = caches.open(APP_CACHE).then(function (cache) {
    return cacheMissing(cache, engineFiles(data.kinds));
  });
  event.waitUntil(
    done.then(
      function () {
        if (port) port.postMessage({ ok: true });
      },
      function (error) {
        if (port) port.postMessage({ ok: false, error: String(error) });
      }
    )
  );
});

function withoutSearch(url) {
  var end = url.search(/[?#]/);
  return end < 0 ? url : url.slice(0, end);
}

/** The cached file at `url`, else the network's answer to `request` (cached when it is a success). */
function fromCache(url, request) {
  return caches.open(APP_CACHE).then(function (cache) {
    return cache.match(url).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (response.ok) cache.put(url, response.clone());
        return response;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = withoutSearch(request.url);
  if (request.mode === 'navigate') {
    // Only the app's own page: other pages under this scope (previews, the probe, the ebook page) are not the app.
    if (url === SCOPE || url === SCOPE + 'index.html') {
      event.respondWith(fromCache(SCOPE, request));
    }
    return;
  }
  if (KNOWN[url]) event.respondWith(fromCache(url, request));
});
