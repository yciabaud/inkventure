/*
 * Inkventure Decker probe (story S0.11, SPEC §13).
 * Plain ES5 like the other probes. It loads the tour deck and Decker's web runtime as patched for e-ink
 * (runtime.js, built by scripts/build/decker-probe.ts), and reports what the deck costs on this device: download,
 * parse and start of the runtime, the first card drawn, each tap (time to its first frame, to a card change, to the
 * loop going idle), and whether the loop really stops on a static card (ticks and draws over 10 s).
 * The runtime reports through `window.ikDecker`; nothing here polls it.
 */
(function () {
  'use strict';

  var PROBE_VERSION = 1;
  var IDLE_WINDOW_MS = 10000;
  var MAX_TAPS = 8;

  var results = [];
  var errors = [];
  var taps = [];
  var events = { touchstart: 0, touchend: 0, mousedown: 0, mouseup: 0, click: 0, keydown: 0 };
  var idleTimer = null;
  var loggedInputs = 0;
  var ik = (window.ikDecker = window.ikDecker || {});

  function $(id) {
    return document.getElementById(id);
  }

  function now() {
    return window.performance && performance.now ? performance.now() : new Date().getTime();
  }

  function ms(value) {
    return value == null ? '–' : Math.round(value) + ' ms';
  }

  function message(e) {
    if (!e) return 'unknown error';
    return (e.name ? e.name + ': ' : '') + (e.message || String(e));
  }

  function set(key, value) {
    for (var i = 0; i < results.length; i++) {
      if (results[i][0] === key) {
        results[i][1] = String(value);
        return;
      }
    }
    results.push([key, String(value)]);
  }

  function reportText() {
    var lines = ['inkventure-decker-probe v' + PROBE_VERSION];
    for (var i = 0; i < results.length; i++) lines.push(results[i][0] + ': ' + results[i][1]);
    for (var t = 0; t < taps.length; t++) lines.push('tap.' + (t + 1) + ': ' + taps[t]);
    var counts = [];
    for (var name in events) counts.push(name + ' ' + events[name]);
    lines.push('input.events: ' + counts.join(', '));
    if (errors.length) lines.push('errors: ' + errors.join(' | '));
    return lines.join('\n');
  }

  function render(status) {
    if (status) $('status').textContent = status;
    var live = [
      'card: ' + (ik.cardName || '–') + (ik.awake ? ' (running)' : ' (idle)'),
      'ticks ' + (ik.ticks || 0) + ', draws ' + (ik.draws || 0),
      'last tick ' + ms(ik.tickMs) + ', last draw ' + ms(ik.syncMs)
    ];
    if (taps.length) live.push('last tap: ' + taps[taps.length - 1]);
    $('live').textContent = live.join('\n');
  }

  // --- Environment --------------------------------------------------------------------------------------

  function checkEnvironment() {
    set('probe.startedAt', new Date().toUTCString());
    set('ua', navigator.userAgent);
    set(
      'viewport',
      window.innerWidth + 'x' + window.innerHeight + ' @' + (window.devicePixelRatio || 1)
    );
    try {
      var data = new ImageData(512, 342);
      set(
        'feature.newImageData',
        data.width === 512 && data.data.length === 512 * 342 * 4 ? 'yes' : 'odd'
      );
    } catch (e) {
      set('feature.newImageData', 'no (' + message(e) + ')');
    }
    var passive = false;
    try {
      var options = Object.defineProperty({}, 'passive', {
        get: function () {
          passive = true;
          return false;
        }
      });
      window.addEventListener('ik-test', null, options);
      window.removeEventListener('ik-test', null, options);
    } catch (e) {
      passive = false;
    }
    set('feature.passiveOption', passive ? 'yes' : 'no');
    set('feature.touchEvents', 'ontouchstart' in window ? 'yes' : 'no');
    set('feature.pointerEvents', window.PointerEvent ? 'yes' : 'no');
    set('feature.requestAnimationFrame', window.requestAnimationFrame ? 'yes' : 'no');
    set(
      'feature.audio',
      window.AudioContext ? 'AudioContext' : window.webkitAudioContext ? 'webkitAudioContext' : 'no'
    );
  }

  function countEvents() {
    function counter(name) {
      return function () {
        events[name]++;
      };
    }
    for (var name in events) document.addEventListener(name, counter(name), true);
  }

  // Taps on the panel and the report must not reach Decker, whose touchstart handler on <body> cancels them.
  function shield(element) {
    var names = [
      'touchstart',
      'touchend',
      'touchmove',
      'mousedown',
      'mouseup',
      'mousemove',
      'keydown'
    ];
    for (var i = 0; i < names.length; i++) {
      element.addEventListener(names[i], function (e) {
        e.stopPropagation();
      });
    }
  }

  // --- Loading ----------------------------------------------------------------------------------------

  function get(url, done) {
    var start = now();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) done(null, xhr.responseText, now() - start);
      else done(new Error(url + ': HTTP ' + xhr.status));
    };
    xhr.onerror = function () {
      done(new Error(url + ': network error'));
    };
    xhr.send();
  }

  function kib(text) {
    return Math.round(text.length / 102.4) / 10 + ' KiB';
  }

  function load() {
    render('Downloading the deck…');
    get('tour.deck', function (error, deck, deckMs) {
      if (error) return fail(error);
      set('load.deck', kib(deck) + ' in ' + ms(deckMs));
      var holder = document.createElement('script');
      holder.setAttribute('language', 'decker');
      holder.type = 'text/x-decker';
      holder.text = deck;
      document.body.appendChild(holder);
      render('Downloading the runtime…');
      get('runtime.js', function (error2, source, runtimeMs) {
        if (error2) return fail(error2);
        set('load.runtime', kib(source) + ' in ' + ms(runtimeMs));
        render('Starting Decker…');
        // Let the status show before the long synchronous parse and start.
        setTimeout(function () {
          start(source);
        }, 50);
      });
    });
  }

  function start(source) {
    ik.ondraw = onDraw;
    ik.onidle = onIdle;
    var script = document.createElement('script');
    script.text = source;
    var before = now();
    try {
      document.body.appendChild(script);
    } catch (e) {
      errors.push('runtime: ' + message(e));
    }
    var after = now();
    if (ik.runStart == null) return fail(new Error('the runtime did not run (see errors)'));
    set('runtime.parse', ms(ik.runStart - before));
    set('runtime.start', ms((ik.runEnd || after) - ik.runStart));
    set('runtime.total', ms(after - before));
  }

  function fail(error) {
    errors.push(message(error));
    render('Failed: ' + message(error));
  }

  // --- Measures ----------------------------------------------------------------------------------------

  function onDraw() {
    if (ik.draws === 1) {
      set('firstDraw', ms(ik.firstDraw - ik.runStart) + ' after the runtime started');
      set('firstDraw.tick', ms(ik.tickMs));
      set('firstDraw.sync', ms(ik.syncMs));
      render('Running');
    }
  }

  function onIdle() {
    if (ik.inputs > loggedInputs) {
      loggedInputs = ik.inputs;
      var row =
        (ik.inputCard || '?') +
        (ik.cardName !== ik.inputCard ? ' -> ' + ik.cardName : '') +
        ': first frame ' +
        ms(ik.response) +
        (ik.cardChange != null ? ', card ' + ms(ik.cardChange) : '') +
        ', idle ' +
        ms(ik.settle) +
        ' (tick ' +
        ms(ik.tickMs) +
        ', draw ' +
        ms(ik.syncMs) +
        ')';
      taps.push(row);
      if (taps.length > MAX_TAPS) taps.shift();
    }
    if (results.length && !findResult('idle.firstReached')) {
      set('idle.firstReached', ms(now() - ik.runStart) + ' after the runtime started');
    }
    render('Idle — measuring 10 s');
    watchIdle();
  }

  function findResult(key) {
    for (var i = 0; i < results.length; i++) if (results[i][0] === key) return results[i][1];
    return null;
  }

  // Ticks and draws over 10 s on a static card: both should stay at 0.
  function watchIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    var ticks = ik.ticks;
    var draws = ik.draws;
    var inputs = ik.inputs;
    var card = ik.cardName;
    idleTimer = setTimeout(function () {
      idleTimer = null;
      if (ik.inputs !== inputs) return;
      set(
        'idle.10s',
        ik.ticks - ticks + ' ticks, ' + (ik.draws - draws) + ' draws on "' + card + '"'
      );
      render('Idle — 10 s measured');
    }, IDLE_WINDOW_MS);
  }

  // --- Report and QR code (same splitting as the device probe) ------------------------------------------

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

  function qrHtml(text) {
    if (typeof qrcode === 'undefined') return '<p>QR library failed to load.</p>';
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    var parts = splitReport(text);
    var html = '';
    for (var i = 0; i < parts.length; i++) {
      var label = 'Part ' + (i + 1) + '/' + parts.length;
      try {
        var qr = qrcode(0, 'L');
        qr.addData('[' + label + ']\n' + parts[i]);
        qr.make();
        html +=
          '<p><b>' + label + '</b></p>' + qr.createImgTag(4, 16, 'Decker report QR code, ' + label);
      } catch (e) {
        html += '<p>' + label + ': could not build a QR code; please copy the text below.</p>';
      }
    }
    return html;
  }

  function showReport() {
    var text = reportText();
    $('report').textContent = text;
    $('qr').innerHTML = qrHtml(text);
    $('sheet').style.display = 'block';
    window.scrollTo(0, 0);
  }

  function hideReport() {
    $('sheet').style.display = 'none';
    $('qr').innerHTML = '';
  }

  // --- Run --------------------------------------------------------------------------------------------

  window.onerror = function (msg, url, line) {
    errors.push(msg + (line ? ' (line ' + line + ')' : ''));
  };
  shield($('panel'));
  shield($('sheet'));
  $('show-report').onclick = showReport;
  $('close-report').onclick = hideReport;
  countEvents();
  checkEnvironment();
  load();
})();
