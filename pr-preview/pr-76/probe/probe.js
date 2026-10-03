/*
 * Inkventure device probe (story S0.3, SPEC §2.2).
 * Plain ES5 on purpose: it must run on the Kindle experimental browser and report what that browser supports,
 * so it cannot depend on the app's build or on any feature it is trying to detect.
 */
(function () {
  'use strict';

  var PROBE_VERSION = 1;
  var STORAGE_PREFIX = 'ik-probe:';
  var IF_ARCHIVE_FILE = 'https://ifarchive.org/if-archive/games/zcode/905.z5';
  var IF_ARCHIVE_MIRROR_FILE = 'https://mirror.ifarchive.org/if-archive/games/zcode/905.z5';
  var IFDB_API = 'https://ifdb.org/search?json&searchfor=zork';
  var IFDB_COVER = 'https://ifdb.org/coverart?id=0dbnusxunq7fw5ro&thumbnail=120x120';
  var NETWORK_TIMEOUT_MS = 15000;
  var APP_TIMEOUT_MS = 30000;

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

  function yesNo(value) {
    return value ? 'yes' : 'no';
  }

  function safe(key, fn) {
    try {
      set(key, fn());
    } catch (e) {
      set(key, 'error: ' + (e && e.message ? e.message : e));
    }
  }

  function reportText() {
    var lines = ['inkventure-probe v' + PROBE_VERSION];
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

  function begin() {
    pending++;
    render();
    var id = runId;
    var finished = false;
    return function () {
      if (finished || id !== runId) return false;
      finished = true;
      pending--;
      render();
      return true;
    };
  }

  window.onerror = function (message, source, line) {
    errors.push(message + ' @' + (source || '').replace(/^.*\//, '') + ':' + line);
    render();
  };

  // --- Requests ---------------------------------------------------------------------------------

  function request(url, responseType, callback) {
    var xhr;
    var done = false;
    function finish(status, info) {
      if (done) return;
      done = true;
      callback(status, info, xhr);
    }
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      if (responseType) xhr.responseType = responseType;
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) finish(xhr.status, '');
      };
      xhr.onerror = function () {
        finish(0, 'network error');
      };
      xhr.send();
      setTimeout(function () {
        if (!done) {
          try {
            xhr.abort();
          } catch (e) {
            /* ignore */
          }
          finish(0, 'timeout');
        }
      }, NETWORK_TIMEOUT_MS);
    } catch (e) {
      finish(0, 'exception: ' + e.message);
    }
  }

  function byteLength(xhr) {
    var response = xhr.response;
    if (response && typeof response.byteLength === 'number') return response.byteLength;
    if (typeof xhr.responseText === 'string') return xhr.responseText.length;
    return 0;
  }

  function describe(status, info, xhr) {
    if (status >= 200 && status < 300) return 'ok ' + status + ' (' + byteLength(xhr) + ' bytes)';
    if (status === 0) return 'blocked (CORS or offline' + (info ? ', ' + info : '') + ')';
    return 'http ' + status;
  }

  function checkBuild() {
    var end = begin();
    request('../version.json?probe=' + new Date().getTime(), '', function (status, info, xhr) {
      if (status === 200) {
        try {
          var build = JSON.parse(xhr.responseText);
          set('build.commit', String(build.commit).slice(0, 12));
          set('build.date', build.date);
        } catch (e) {
          set('build.commit', 'unreadable version.json');
        }
      } else {
        set('build.commit', describe(status, info, xhr));
      }
      end();
    });
  }

  function checkNetwork() {
    var end = begin();
    request('../version.json', 'arraybuffer', function (status, info, xhr) {
      var ok = status === 200 && xhr.response && typeof xhr.response.byteLength === 'number';
      set('net.xhrArraybuffer', ok ? 'yes' : 'no (' + describe(status, info, xhr) + ')');
      end();
    });

    var targets = [
      ['net.ifArchive', IF_ARCHIVE_FILE, 'arraybuffer'],
      ['net.ifArchiveMirror', IF_ARCHIVE_MIRROR_FILE, 'arraybuffer'],
      ['net.ifdbApi', IFDB_API, '']
    ];
    for (var i = 0; i < targets.length; i++) {
      (function (target) {
        var done = begin();
        set(target[0], 'pending');
        request(target[1], target[2], function (status, info, xhr) {
          set(target[0], describe(status, info, xhr));
          done();
        });
      })(targets[i]);
    }

    var imgDone = begin();
    set('net.ifdbCoverImage', 'pending');
    var img = new Image();
    var timer = setTimeout(function () {
      set('net.ifdbCoverImage', 'timeout');
      imgDone();
    }, NETWORK_TIMEOUT_MS);
    img.onload = function () {
      clearTimeout(timer);
      set('net.ifdbCoverImage', 'ok ' + img.width + 'x' + img.height);
      imgDone();
    };
    img.onerror = function () {
      clearTimeout(timer);
      set('net.ifdbCoverImage', 'failed');
      imgDone();
    };
    img.src = IFDB_COVER;
  }

  // --- Device & JavaScript ------------------------------------------------------------------------

  function checkDevice() {
    safe('device.userAgent', function () {
      return navigator.userAgent;
    });
    safe('device.language', function () {
      return (
        (navigator.languages ? navigator.languages.join(',') : '') + ' / ' + navigator.language
      );
    });
    safe('device.viewport', function () {
      var el = document.documentElement;
      return (window.innerWidth || el.clientWidth) + 'x' + (window.innerHeight || el.clientHeight);
    });
    safe('device.screen', function () {
      return screen.width + 'x' + screen.height + ' depth ' + screen.colorDepth;
    });
    safe('device.pixelRatio', function () {
      return window.devicePixelRatio || 'n/a';
    });
    safe('device.online', function () {
      return 'onLine' in navigator ? yesNo(navigator.onLine) : 'n/a';
    });
  }

  function syntax(code) {
    try {
      new Function(code);
      return true;
    } catch (e) {
      return false;
    }
  }

  function checkJs() {
    var features = [
      ['arrow', 'var f = () => 1;'],
      ['letConst', 'let a = 1; const b = 2;'],
      ['class', 'class A {}'],
      ['template', 'var a = `x`;'],
      ['destructuring', 'var { a } = { a: 1 };'],
      ['defaultParams', 'function f(a = 1) {}'],
      ['spread', 'var a = [...[1]];'],
      ['forOf', 'for (var x of []) {}'],
      ['generators', 'function* g() {}'],
      ['asyncAwait', 'async function f() { await 1; }'],
      ['optionalChaining', 'var a = {}; var b = a?.b;']
    ];
    var supported = [];
    var missing = [];
    for (var i = 0; i < features.length; i++) {
      (syntax(features[i][1]) ? supported : missing).push(features[i][0]);
    }
    set('js.syntax.yes', supported.join(',') || 'none');
    set('js.syntax.no', missing.join(',') || 'none');

    var builtins = {
      Promise: typeof Promise,
      fetch: typeof window.fetch,
      Map: typeof Map,
      Set: typeof Set,
      WeakMap: typeof WeakMap,
      Symbol: typeof Symbol,
      Proxy: typeof Proxy,
      ObjectAssign: typeof Object.assign,
      ArrayFrom: typeof Array.from,
      ArrayIncludes: typeof Array.prototype.includes,
      StringStartsWith: typeof String.prototype.startsWith,
      MathImul: typeof Math.imul,
      Uint8Array: typeof Uint8Array,
      DataView: typeof DataView,
      TextDecoder: typeof TextDecoder,
      requestAnimationFrame: typeof window.requestAnimationFrame,
      WebAssembly: typeof WebAssembly,
      Worker: typeof Worker,
      Blob: typeof Blob,
      FileReader: typeof FileReader
    };
    var yes = [];
    var no = [];
    for (var name in builtins) {
      if (Object.prototype.hasOwnProperty.call(builtins, name)) {
        (builtins[name] === 'undefined' ? no : yes).push(name);
      }
    }
    set('js.builtins.yes', yes.join(','));
    set('js.builtins.no', no.join(',') || 'none');

    safe('js.intl', function () {
      if (typeof Intl === 'undefined') return 'no';
      var parts = ['yes'];
      try {
        parts.push('fr number ' + new Intl.NumberFormat('fr-FR').format(1234.5));
      } catch (e) {
        parts.push('NumberFormat error');
      }
      return parts.join(', ');
    });
  }

  // --- Web APIs & storage -------------------------------------------------------------------------

  function checkApis() {
    safe('api.hashchange', function () {
      return yesNo('onhashchange' in window);
    });
    safe('api.historyPushState', function () {
      return yesNo(!!(window.history && history.pushState));
    });
    safe('api.indexedDB', function () {
      return yesNo(!!window.indexedDB);
    });
    safe('api.serviceWorker', function () {
      return yesNo('serviceWorker' in navigator);
    });
    safe('api.cacheStorage', function () {
      return yesNo('caches' in window);
    });
    safe('api.documentFonts', function () {
      return yesNo(!!document.fonts);
    });
    safe('api.resourceTiming', function () {
      return yesNo(!!(window.performance && performance.getEntriesByType));
    });
    safe('api.matchMedia', function () {
      return yesNo(!!window.matchMedia);
    });
  }

  function checkStorage() {
    var ls;
    try {
      ls = window.localStorage;
      ls.setItem(STORAGE_PREFIX + 'test', '1');
      var ok = ls.getItem(STORAGE_PREFIX + 'test') === '1';
      ls.removeItem(STORAGE_PREFIX + 'test');
      set('storage.localStorage', ok ? 'yes' : 'read-back failed');
    } catch (e) {
      set('storage.localStorage', 'no (' + (e && e.name ? e.name : e) + ')');
      return;
    }

    // Persistence across browser restarts: compare with what the previous runs stored.
    safe('storage.persistence', function () {
      var first = ls.getItem(STORAGE_PREFIX + 'firstRun');
      var runs = parseInt(ls.getItem(STORAGE_PREFIX + 'runs') || '0', 10) + 1;
      if (!first) {
        first = new Date().toISOString ? new Date().toISOString() : String(new Date());
        ls.setItem(STORAGE_PREFIX + 'firstRun', first);
      }
      ls.setItem(STORAGE_PREFIX + 'runs', String(runs));
      return 'run #' + runs + ', first run ' + first;
    });

    try {
      set('storage.sessionStorage', yesNo(!!window.sessionStorage));
    } catch (e) {
      set('storage.sessionStorage', 'no');
    }

    // Approximate quota: fill with 256K-character chunks until the browser refuses, then clean up.
    var end = begin();
    setTimeout(function () {
      var chunk = new Array(256 * 1024 + 1).join('x');
      var count = 0;
      var error = '';
      try {
        while (count < 80) {
          ls.setItem(STORAGE_PREFIX + 'quota' + count, chunk);
          count++;
        }
      } catch (e) {
        error = e && e.name ? e.name : String(e);
      }
      for (var i = 0; i <= count; i++) ls.removeItem(STORAGE_PREFIX + 'quota' + i);
      var chars = count * 256 * 1024;
      set(
        'storage.quotaChars',
        (count >= 80 ? '>= ' : '~') +
          (chars / (1024 * 1024)).toFixed(2) +
          'M chars' +
          (error ? ' (stopped by ' + error + ')' : '')
      );
      end();
    }, 0);
  }

  // --- CSS ----------------------------------------------------------------------------------------

  function cssValue(property, value) {
    var el = document.createElement('div');
    try {
      el.style[property] = value;
    } catch (e) {
      return false;
    }
    return el.style[property] !== '' && el.style[property] !== undefined;
  }

  function checkCss() {
    var el = document.createElement('div');
    set(
      'css.flexbox',
      [
        'flex:' + yesNo(cssValue('display', 'flex')),
        '-webkit-flex:' + yesNo(cssValue('display', '-webkit-flex')),
        '-webkit-box:' + yesNo(cssValue('display', '-webkit-box'))
      ].join(' ')
    );
    set('css.grid', yesNo(cssValue('display', 'grid')));
    set('css.customProperties', yesNo(cssValue('color', 'var(--x)')));
    set(
      'css.filterGrayscale',
      yesNo(cssValue('filter', 'grayscale(1)') || cssValue('webkitFilter', 'grayscale(1)'))
    );
    set('css.objectFit', yesNo('objectFit' in el.style));
    set('css.calc', yesNo(cssValue('width', 'calc(1px + 1px)')));
    set('css.vw', yesNo(cssValue('width', '10vw')));
    set('css.hyphens', yesNo('hyphens' in el.style || 'webkitHyphens' in el.style));
    set('css.positionFixed', yesNo(cssValue('position', 'fixed')));
  }

  // --- Input --------------------------------------------------------------------------------------

  var touch = { types: {}, startX: null, lastSwipe: 'none' };

  function describeTouch() {
    var seen = [];
    for (var type in touch.types) {
      if (Object.prototype.hasOwnProperty.call(touch.types, type))
        seen.push(type + 'x' + touch.types[type]);
    }
    set('input.eventsSeen', seen.join(',') || 'none yet (use the swipe box)');
    set('input.lastSwipe', touch.lastSwipe);
  }

  function checkInput() {
    set('input.touchEvents', yesNo('ontouchstart' in window));
    set('input.pointerEvents', yesNo(!!window.PointerEvent));
    set(
      'input.maxTouchPoints',
      navigator.maxTouchPoints === undefined ? 'n/a' : navigator.maxTouchPoints
    );
    describeTouch();
  }

  function watchSwipeBox() {
    var box = $('swipe');
    function record(type, event) {
      touch.types[type] = (touch.types[type] || 0) + 1;
      var point = event.changedTouches && event.changedTouches[0];
      if (type === 'touchstart' && point) touch.startX = point.clientX;
      if (type === 'touchend' && point && touch.startX !== null) {
        var dx = Math.round(point.clientX - touch.startX);
        touch.lastSwipe =
          Math.abs(dx) < 30
            ? 'tap (dx ' + dx + ')'
            : (dx < 0 ? 'left' : 'right') + ' (dx ' + dx + ')';
        touch.startX = null;
      }
      if (type === 'click' && touch.lastSwipe === 'none') touch.lastSwipe = 'click only';
      box.innerHTML = 'Last: ' + type + ' — ' + touch.lastSwipe;
      describeTouch();
    }
    var types = ['touchstart', 'touchmove', 'touchend', 'click', 'pointerdown'];
    for (var i = 0; i < types.length; i++) {
      (function (type) {
        if (box.addEventListener) {
          box.addEventListener(
            type,
            function (event) {
              record(type, event);
            },
            false
          );
        }
      })(types[i]);
    }
  }

  // --- Performance --------------------------------------------------------------------------------

  function checkPerf() {
    var end = begin();
    setTimeout(function () {
      var t = now();
      var sum = 0;
      for (var i = 0; i < 1000000; i++) sum += i % 7;
      set('perf.loop1e6Ms', Math.round(now() - t));
      window.__probeSink = sum; // keep the loop from being optimised away

      var items = [];
      for (var j = 0; j < 1500; j++) {
        items.push({
          t: 'tuid' + j,
          n: 'An adventure title ' + j,
          a: 'Some Author',
          y: 1990 + (j % 30),
          r: 3.5,
          g: ['Fantasy', 'Humor']
        });
      }
      t = now();
      var json = JSON.stringify(items);
      var stringifyMs = now() - t;
      t = now();
      JSON.parse(json);
      set(
        'perf.json',
        Math.round(json.length / 1024) +
          ' KB: parse ' +
          Math.round(now() - t) +
          ' ms, stringify ' +
          Math.round(stringifyMs) +
          ' ms'
      );

      var host = document.createElement('div');
      host.style.position = 'absolute';
      host.style.left = '-2000px';
      host.style.width = '560px';
      document.body.appendChild(host);
      t = now();
      for (var k = 0; k < 300; k++) {
        var p = document.createElement('p');
        p.appendChild(
          document.createTextNode(
            'You are standing in an open field west of a white house, with a boarded front door. ' +
              k
          )
        );
        host.appendChild(p);
      }
      var height = host.offsetHeight;
      set('perf.layout300ParagraphsMs', Math.round(now() - t) + ' (' + height + 'px)');
      document.body.removeChild(host);
      end();
    }, 50);
  }

  // --- The real app, loaded in a hidden frame -----------------------------------------------------

  function checkApp() {
    var end = begin();
    set('app.render', 'loading');
    var old = $('app-frame');
    if (old) old.parentNode.removeChild(old);
    var frame = document.createElement('iframe');
    frame.id = 'app-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    var start = now();
    frame.src = '../?probe=' + new Date().getTime() + '#/home';
    document.body.appendChild(frame);

    function summariseResources(win) {
      if (!win.performance || !win.performance.getEntriesByType) {
        set('app.bytes', 'n/a (no Resource Timing)');
        set('app.fontFormat', 'n/a');
        return;
      }
      var entries = win.performance.getEntriesByType('resource');
      var transfer = 0;
      var encoded = 0;
      var fonts = {};
      for (var i = 0; i < entries.length; i++) {
        transfer += entries[i].transferSize || 0;
        encoded += entries[i].encodedBodySize || 0;
        var match = /\.(woff2?)(\?|$)/.exec(entries[i].name);
        if (match) fonts[match[1]] = (fonts[match[1]] || 0) + 1;
      }
      set(
        'app.bytes',
        entries.length +
          ' resources, transfer ' +
          Math.round(transfer / 1024) +
          ' KB, encoded ' +
          Math.round(encoded / 1024) +
          ' KB (0 transfer = cache or unsupported)'
      );
      var formats = [];
      for (var format in fonts) {
        if (Object.prototype.hasOwnProperty.call(fonts, format))
          formats.push(format + ' x' + fonts[format]);
      }
      set('app.fontFormat', formats.join(', ') || 'none seen (yet)');
    }

    function poll() {
      var elapsed = now() - start;
      var win;
      var doc;
      try {
        win = frame.contentWindow;
        doc = frame.contentDocument || (win && win.document);
      } catch (e) {
        set('app.render', 'cannot inspect frame: ' + e.message);
        end();
        return;
      }
      var root = doc && doc.getElementById('app');
      if (root && root.children && root.children.length > 0) {
        set('app.render', Math.round(elapsed) + ' ms to first render of Home');
        set('app.bundle', win.System ? 'legacy (SystemJS)' : 'modern (ES modules)');
        set('app.htmlLang', doc.documentElement.lang || 'n/a');
        // Fonts load after the first render: give them a moment before reading Resource Timing.
        setTimeout(function () {
          summariseResources(win);
          end();
        }, 3000);
        return;
      }
      if (elapsed > APP_TIMEOUT_MS) {
        set('app.render', 'timeout after ' + APP_TIMEOUT_MS / 1000 + ' s (app did not render)');
        end();
        return;
      }
      setTimeout(poll, 100);
    }
    setTimeout(poll, 100);
  }

  // --- QR code ------------------------------------------------------------------------------------

  // Dense QR codes are hard to scan from e-ink, so the report is split into ~900-character parts.
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
    // The report may contain non-Latin-1 characters (e.g. French number spacing): encode as UTF-8.
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
          '<p><b>' + label + '</b></p>' + qr.createImgTag(4, 16, 'Probe report QR code, ' + label);
      } catch (e) {
        html += '<p>' + label + ': could not build a QR code; please copy the text below.</p>';
      }
    }
    target.innerHTML = html;
  }

  // --- Run ----------------------------------------------------------------------------------------

  function run() {
    runId++;
    results = [];
    errors = [];
    pending = 0;
    $('qr').innerHTML = '';
    set('probe.startedAt', new Date().toUTCString());
    checkBuild();
    checkDevice();
    checkJs();
    checkApis();
    checkCss();
    checkInput();
    checkStorage();
    checkPerf();
    checkNetwork();
    checkApp();
    render();
  }

  $('rerun').onclick = run;
  $('show-qr').onclick = showQr;
  watchSwipeBox();
  run();
})();
