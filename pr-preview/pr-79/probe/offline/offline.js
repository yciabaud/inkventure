/*
 * Inkventure offline probe (story S0.9, SPEC §6.2, §13 #11).
 * Plain ES5 like the device probe. It answers: can this browser reload a page with the network off (Service Worker),
 * and keep a story file offline in the Cache API or IndexedDB, across reloads and browser restarts?
 * Everything it stores is kept between runs on purpose (that is the persistence test); "Clear test data" removes it.
 */
/* global Promise -- feature-detected: only used where the Cache API or a Service Worker exists. */
(function () {
  'use strict';

  var PROBE_VERSION = 1;
  var LS_PREFIX = 'ik-probe-offline:';
  var SHELL_CACHE = 'ik-probe-offline-shell-v1';
  var DATA_CACHE = 'ik-probe-offline-data-v1';
  var DB_NAME = 'ik-probe-offline';
  var STORY_FILE = 'https://ifarchive.org/if-archive/games/zcode/905.z5';
  var BLOB_SIZES = [1, 5, 20]; // MB
  var TIMEOUT_MS = 15000;

  var results = [];
  var pending = 0;
  var errors = [];
  var runId = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function now() {
    return window.performance && performance.now ? performance.now() : new Date().getTime();
  }

  function ms(start) {
    return Math.round(now() - start) + ' ms';
  }

  function message(e) {
    if (!e) return 'unknown error';
    return (e.name ? e.name + ': ' : '') + (e.message || String(e));
  }

  function set(key, value) {
    for (var i = 0; i < results.length; i++) {
      if (results[i][0] === key) {
        results[i][1] = String(value);
        render();
        return;
      }
    }
    results.push([key, String(value)]);
    render();
  }

  function reportText() {
    var lines = ['inkventure-offline-probe v' + PROBE_VERSION];
    for (var i = 0; i < results.length; i++) lines.push(results[i][0] + ': ' + results[i][1]);
    if (errors.length) lines.push('errors: ' + errors.join(' | '));
    return lines.join('\n');
  }

  function render() {
    var text = reportText();
    $('report').textContent = text;
    $('copy').value = text;
    $('status').textContent = pending > 0 ? 'Running… (' + pending + ' checks left)' : 'Done';
  }

  // Starts an asynchronous check; the returned function ends it once (and is ignored after a re-run).
  function begin() {
    pending++;
    render();
    var id = runId;
    var finished = false;
    var timer = setTimeout(function () {
      if (!finished && id === runId) errors.push('a check timed out');
      end();
    }, 4 * TIMEOUT_MS);
    function end() {
      if (finished || id !== runId) return false;
      finished = true;
      clearTimeout(timer);
      pending--;
      render();
      return true;
    }
    return end;
  }

  window.onerror = function (msg, source, line) {
    errors.push(msg + ' @' + (source || '').replace(/^.*\//, '') + ':' + line);
    render();
  };

  function bytes(size) {
    return new Uint8Array(size * 1024 * 1024);
  }

  // --- Environment ----------------------------------------------------------------------------------

  function localGet(key) {
    try {
      return window.localStorage.getItem(LS_PREFIX + key);
    } catch (e) {
      return null;
    }
  }

  function localSet(key, value) {
    try {
      window.localStorage.setItem(LS_PREFIX + key, value);
    } catch (e) {
      /* reported by the localStorage check */
    }
  }

  function checkEnvironment() {
    set('device.userAgent', navigator.userAgent);
    set('device.online', navigator.onLine === false ? 'no' : 'yes');
    var runs = parseInt(localGet('runs') || '0', 10) + 1;
    var first = localGet('firstRun');
    if (!first) {
      first = new Date().toUTCString();
      localSet('firstRun', first);
    }
    localSet('runs', String(runs));
    set('run', '#' + runs + ', first run ' + first);
    set(
      'api',
      'serviceWorker:' +
        ('serviceWorker' in navigator ? 'yes' : 'no') +
        ' caches:' +
        (window.caches ? 'yes' : 'no') +
        ' indexedDB:' +
        (window.indexedDB ? 'yes' : 'no') +
        ' storageManager:' +
        (navigator.storage ? 'yes' : 'no')
    );
  }

  function checkStorageManager() {
    if (!navigator.storage) {
      set('storage.estimate', 'unsupported');
      return;
    }
    if (navigator.storage.estimate) {
      var end = begin();
      navigator.storage.estimate().then(
        function (estimate) {
          set(
            'storage.estimate',
            'usage ' +
              (estimate.usage / 1048576).toFixed(1) +
              ' MB of ' +
              (estimate.quota / 1048576).toFixed(0) +
              ' MB'
          );
          end();
        },
        function (e) {
          set('storage.estimate', 'error: ' + message(e));
          end();
        }
      );
    }
    if (navigator.storage.persist) {
      var endPersist = begin();
      navigator.storage.persist().then(
        function (granted) {
          set('storage.persist', granted ? 'granted' : 'refused');
          endPersist();
        },
        function (e) {
          set('storage.persist', 'error: ' + message(e));
          endPersist();
        }
      );
    }
  }

  // --- Network: is the site reachable right now? -----------------------------------------------------

  function checkNetwork(callback) {
    var end = begin();
    var done = false;
    var xhr = new XMLHttpRequest();
    function finish(reachable, info) {
      if (done) return;
      done = true;
      set('net.site', reachable ? 'reachable' : 'unreachable (' + info + ')');
      end();
      callback(reachable);
    }
    try {
      // version.json is not in the Service Worker's cache, so this always goes to the network.
      xhr.open('GET', '../../version.json?offline-probe=' + new Date().getTime(), true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4)
          finish(xhr.status >= 200 && xhr.status < 400, 'status ' + xhr.status);
      };
      xhr.onerror = function () {
        finish(false, 'network error');
      };
      xhr.send();
      setTimeout(function () {
        finish(false, 'timeout');
      }, TIMEOUT_MS);
    } catch (e) {
      finish(false, message(e));
    }
  }

  // --- Service Worker -------------------------------------------------------------------------------

  function checkServiceWorker(online) {
    if (!('serviceWorker' in navigator)) {
      set('sw.register', 'unsupported');
      set('offline.reload', 'impossible (no Service Worker)');
      return;
    }
    var controlled = !!navigator.serviceWorker.controller;
    set('sw.controlledAtLoad', controlled ? 'yes' : 'no');
    if (controlled && !online) {
      set('offline.reload', 'ok (page served by the Service Worker with the network off)');
    } else if (!online) {
      set('offline.reload', 'failed (network off and the page is not controlled)');
    } else if (controlled) {
      set('offline.reload', 'ready: turn Wi-Fi off and reload');
    } else {
      set('offline.reload', 'not yet: wait for Done, then turn Wi-Fi off and reload');
    }

    var end = begin();
    var start = now();
    navigator.serviceWorker.register('sw.js').then(
      function (registration) {
        var worker = registration.installing || registration.waiting || registration.active;
        set('sw.register', 'ok (' + (worker ? worker.state : 'no worker') + ', ' + ms(start) + ')');
        navigator.serviceWorker.ready.then(function () {
          set('sw.active', 'yes (' + ms(start) + ')');
          if (!window.caches) return end();
          caches
            .open(SHELL_CACHE)
            .then(function (cache) {
              return cache.keys();
            })
            .then(
              function (keys) {
                set('sw.shellCached', keys.length + ' files');
                set('sw.controlledNow', navigator.serviceWorker.controller ? 'yes' : 'no');
                end();
              },
              function (e) {
                set('sw.shellCached', 'error: ' + message(e));
                end();
              }
            );
        });
      },
      function (e) {
        set('sw.register', 'error: ' + message(e));
        end();
      }
    );
  }

  // --- Cache API ------------------------------------------------------------------------------------

  function checkCache(online) {
    if (!window.caches) {
      set('cache', 'unsupported');
      return;
    }
    var end = begin();
    caches
      .open(DATA_CACHE)
      .then(function (cache) {
        return cacheStoryFile(cache, online).then(function () {
          return cacheBlobs(cache, 0);
        });
      })
      .then(end, function (e) {
        set('cache', 'error: ' + message(e));
        end();
      });
  }

  // A real story file from the IF Archive: stored while online, read back from the cache when offline.
  function cacheStoryFile(cache, online) {
    var start = now();
    return cache.match(STORY_FILE).then(function (cached) {
      if (cached) {
        return cached.arrayBuffer().then(function (buffer) {
          set(
            'cache.storyFile',
            'kept from an earlier run: ' + buffer.byteLength + ' bytes, ' + ms(start)
          );
        });
      }
      if (!online) {
        set('cache.storyFile', 'missing (never stored, or evicted)');
        return null;
      }
      return fetch(STORY_FILE, { mode: 'cors' })
        .then(function (response) {
          if (!response.ok) throw new Error('http ' + response.status);
          return cache.put(STORY_FILE, response);
        })
        .then(function () {
          return cache.match(STORY_FILE);
        })
        .then(function (stored) {
          return stored.arrayBuffer();
        })
        .then(
          function (buffer) {
            set('cache.storyFile', 'stored now: ' + buffer.byteLength + ' bytes, ' + ms(start));
          },
          function (e) {
            set('cache.storyFile', 'error: ' + message(e));
          }
        );
    });
  }

  // Synthetic files of growing size: how much fits, and is it still there after a reload or restart?
  function cacheBlobs(cache, index) {
    if (index >= BLOB_SIZES.length) return Promise.resolve();
    var size = BLOB_SIZES[index];
    var key = 'blob-' + size + 'mb';
    var start = now();
    return cache
      .match(key)
      .then(function (cached) {
        if (cached) {
          return cached.arrayBuffer().then(function (buffer) {
            set('cache.' + key, 'kept: ' + buffer.byteLength + ' bytes, read ' + ms(start));
          });
        }
        return cache
          .put(key, new Response(bytes(size)))
          .then(function () {
            return cache.match(key);
          })
          .then(function (stored) {
            return stored.arrayBuffer();
          })
          .then(function (buffer) {
            set('cache.' + key, 'stored now: ' + buffer.byteLength + ' bytes, ' + ms(start));
          });
      })
      .then(
        function () {
          return cacheBlobs(cache, index + 1);
        },
        function (e) {
          // A quota error stops the series: larger sizes would fail too.
          set('cache.' + key, 'error: ' + message(e));
        }
      );
  }

  // --- IndexedDB ------------------------------------------------------------------------------------

  function checkIndexedDb() {
    if (!window.indexedDB) {
      set('idb', 'unsupported');
      return;
    }
    var end = begin();
    var request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      set('idb', 'error: ' + message(e));
      end();
      return;
    }
    request.onupgradeneeded = function () {
      request.result.createObjectStore('files');
    };
    request.onerror = function () {
      set('idb', 'error: ' + message(request.error));
      end();
    };
    request.onsuccess = function () {
      idbBlobs(request.result, 0, function () {
        request.result.close();
        end();
      });
    };
  }

  function idbBlobs(db, index, done) {
    if (index >= BLOB_SIZES.length) return done();
    var size = BLOB_SIZES[index];
    var key = 'blob-' + size + 'mb';
    var start = now();
    function fail(e) {
      set('idb.' + key, 'error: ' + message(e));
      done();
    }
    try {
      var get = db.transaction('files', 'readonly').objectStore('files').get(key);
      get.onerror = function () {
        fail(get.error);
      };
      get.onsuccess = function () {
        if (get.result && get.result.byteLength) {
          set('idb.' + key, 'kept: ' + get.result.byteLength + ' bytes, read ' + ms(start));
          return idbBlobs(db, index + 1, done);
        }
        var tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(bytes(size).buffer, key);
        tx.oncomplete = function () {
          set('idb.' + key, 'stored now: ' + size * 1048576 + ' bytes, ' + ms(start));
          idbBlobs(db, index + 1, done);
        };
        tx.onerror = function () {
          fail(tx.error);
        };
        tx.onabort = function () {
          fail(tx.error || 'aborted');
        };
      };
    } catch (e) {
      fail(e);
    }
  }

  // --- Clear ----------------------------------------------------------------------------------------

  function clearCounters() {
    try {
      for (var i = window.localStorage.length - 1; i >= 0; i--) {
        var key = window.localStorage.key(i);
        if (key && key.indexOf(LS_PREFIX) === 0) window.localStorage.removeItem(key);
      }
    } catch (e) {
      /* nothing to clear */
    }
  }

  function clearAll() {
    var steps = [];
    if (!window.Promise) {
      // Then no Service Worker or Cache API either: only the database and the counters can exist.
      if (window.indexedDB) indexedDB.deleteDatabase(DB_NAME);
      clearCounters();
      $('status').textContent = 'Test data cleared.';
      return;
    }
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      steps.push(
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.all(
            registrations.map(function (registration) {
              return registration.unregister();
            })
          );
        })
      );
    }
    if (window.caches) {
      steps.push(caches.delete(SHELL_CACHE), caches.delete(DATA_CACHE));
    }
    if (window.indexedDB) {
      steps.push(
        new Promise(function (resolve) {
          var request = indexedDB.deleteDatabase(DB_NAME);
          request.onsuccess = request.onerror = request.onblocked = resolve;
        })
      );
    }
    clearCounters();
    Promise.all(steps).then(
      function () {
        $('status').textContent = 'Test data cleared. Reload with Wi-Fi on to start again.';
      },
      function (e) {
        $('status').textContent = 'Clearing failed: ' + message(e);
      }
    );
  }

  // --- QR code (same splitting as the device probe) ---------------------------------------------------

  var QR_PART_CHARS = 900;

  function splitReport(text) {
    var lines = text.split('\n');
    var parts = [];
    var current = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].length > QR_PART_CHARS ? lines[i].slice(0, QR_PART_CHARS) : lines[i];
      if (current && current.length + 1 + line.length > QR_PART_CHARS) {
        parts.push(current);
        current = '';
      }
      current = current ? current + '\n' + line : line;
    }
    if (current) parts.push(current);
    return parts;
  }

  function showQr() {
    var target = $('qr');
    if (typeof qrcode === 'undefined') {
      target.innerHTML = '<p>QR library failed to load.</p>';
      return;
    }
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    var parts = splitReport(reportText());
    var html = '';
    for (var i = 0; i < parts.length; i++) {
      var label = 'Part ' + (i + 1) + '/' + parts.length;
      try {
        var qr = qrcode(0, 'L');
        qr.addData('[' + label + ']\n' + parts[i]);
        qr.make();
        html +=
          '<p><b>' +
          label +
          '</b></p>' +
          qr.createImgTag(4, 16, 'Offline report QR code, ' + label);
      } catch (e) {
        html += '<p>' + label + ': could not build a QR code; please copy the text below.</p>';
      }
    }
    target.innerHTML = html;
  }

  // --- Run --------------------------------------------------------------------------------------------

  function run() {
    runId++;
    results = [];
    errors = [];
    pending = 0;
    $('qr').innerHTML = '';
    set('probe.startedAt', new Date().toUTCString());
    checkEnvironment();
    checkStorageManager();
    checkIndexedDb();
    checkNetwork(function (online) {
      checkServiceWorker(online);
      checkCache(online);
    });
    render();
  }

  $('rerun').onclick = run;
  $('show-qr').onclick = showQr;
  $('clear').onclick = clearAll;
  run();
})();
