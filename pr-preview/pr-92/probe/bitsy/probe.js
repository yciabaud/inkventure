/*
 * Inkventure Bitsy probe (story S0.12, SPEC §13).
 * Plain ES5 like the other probes. It loads a game, the default font and Bitsy's engine with an e-ink system layer
 * (runtime.js, built by scripts/build/bitsy-probe.ts), and reports what the game costs on this device: download,
 * parse and start of the runtime, the first room drawn, each input (time to its first frame, to a room change, to
 * the loop going idle), and whether the loop really stops on a still room (ticks and draws over 10 s).
 * The runtime reports through `window.ikBitsy`; nothing here polls it.
 */
(function () {
  'use strict';

  var PROBE_VERSION = 1;
  var IDLE_WINDOW_MS = 10000;
  var MAX_INPUTS = 10;
  var GAMES = { 'keepers-lamp': 'keepers-lamp.bitsy', default: 'default.bitsy' };
  var GRAYS = { stretch: 1, lum: 1, off: 1 };

  var results = [];
  var errors = [];
  var inputs = [];
  var contrasts = {};
  var events = { touchstart: 0, touchend: 0, mousedown: 0, mouseup: 0, click: 0, keydown: 0 };
  var idleTimer = null;
  var loggedInputs = 0;
  var ik = (window.ikBitsy = window.ikBitsy || {});

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

  function param(name) {
    var match = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return match ? decodeURIComponent(match[1]) : null;
  }

  var game = GAMES[param('game')] ? param('game') : 'keepers-lamp';
  var gray = GRAYS[param('gray')] ? param('gray') : 'stretch';

  function set(key, value) {
    for (var i = 0; i < results.length; i++) {
      if (results[i][0] === key) {
        results[i][1] = String(value);
        return;
      }
    }
    results.push([key, String(value)]);
  }

  function findResult(key) {
    for (var i = 0; i < results.length; i++) if (results[i][0] === key) return results[i][1];
    return null;
  }

  function reportText() {
    var lines = ['inkventure-bitsy-probe v' + PROBE_VERSION];
    for (var i = 0; i < results.length; i++) lines.push(results[i][0] + ': ' + results[i][1]);
    for (var t = 0; t < inputs.length; t++) lines.push('input.' + (t + 1) + ': ' + inputs[t]);
    var rooms = [];
    for (var name in contrasts) rooms.push(name + ' ' + contrasts[name]);
    if (rooms.length) lines.push('contrast: ' + rooms.join(', '));
    var counts = [];
    for (var event in events) counts.push(event + ' ' + events[event]);
    lines.push('input.events: ' + counts.join(', '));
    if (errors.length) lines.push('errors: ' + errors.join(' | '));
    return lines.join('\n');
  }

  function render(status) {
    if (status) $('status').textContent = status;
    var live = [
      'room: ' +
        (ik.roomName == null ? '–' : ik.roomName) +
        (ik.dialog ? ', dialogue' : '') +
        (ik.awake ? ' (running)' : ' (idle)'),
      'ticks ' + (ik.ticks || 0) + ', draws ' + (ik.draws || 0),
      'last tick ' + ms(ik.tickMs) + ', last draw ' + ms(ik.drawMs)
    ];
    if (inputs.length) live.push('last input: ' + inputs[inputs.length - 1]);
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
    set('game', game);
    set('gray', gray);
    set('feature.touchEvents', 'ontouchstart' in window ? 'yes' : 'no');
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

  // Keep the links' other setting when switching game or grays.
  function linkSettings() {
    var links = document.getElementsByTagName('a');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href || href.charAt(0) !== '?') continue;
      if (href.indexOf('game=') >= 0) links[i].setAttribute('href', href + '&gray=' + gray);
      else links[i].setAttribute('href', href + '&game=' + game);
    }
  }

  // --- Pad ----------------------------------------------------------------------------------------------

  function bindPad() {
    var buttons = $('pad').getElementsByTagName('button');
    for (var i = 0; i < buttons.length; i++) bindButton(buttons[i]);
  }

  function bindButton(button) {
    var code = Number(button.getAttribute('data-key'));
    var lastTouch = 0;
    function down(e) {
      e.preventDefault();
      if (ik.press) ik.press(code);
    }
    function up(e) {
      e.preventDefault();
      if (ik.release) ik.release(code);
    }
    button.addEventListener('touchstart', function (e) {
      lastTouch = new Date().getTime();
      down(e);
    });
    button.addEventListener('touchend', function (e) {
      lastTouch = new Date().getTime();
      up(e);
    });
    button.addEventListener('mousedown', function (e) {
      if (new Date().getTime() - lastTouch > 800) down(e);
    });
    button.addEventListener('mouseup', function (e) {
      if (new Date().getTime() - lastTouch > 800) up(e);
    });
    button.addEventListener('mouseleave', function () {
      if (ik.keys && ik.keys.held[code]) ik.release(code);
    });
  }

  // The 512 × 512 canvas (Bitsy's 128 × 128 at ×4) takes the width, and the height the pad leaves, in steps of
  // 128 px: each pixel of the room (and each half pixel of the text) then covers whole screen pixels, so it stays
  // sharp without smoothing (512 px on the Kindle's 636 × 740).
  function fit() {
    var canvas = $('game');
    var pad = $('pad').offsetHeight + 16;
    var room = Math.min(window.innerWidth, window.innerHeight - pad);
    var size = Math.max(128, Math.floor(room / 128) * 128);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    set('zoom', Math.round((size / 512) * 100) / 100 + ' (' + size + ' px)');
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
    render('Downloading the game…');
    get(GAMES[game], function (error, gameData, gameMs) {
      if (error) return fail(error);
      set('load.game', kib(gameData) + ' in ' + ms(gameMs));
      get('ascii_small.bitsyfont', function (error2, fontData, fontMs) {
        if (error2) return fail(error2);
        set('load.font', kib(fontData) + ' in ' + ms(fontMs));
        render('Downloading the runtime…');
        get('runtime.js', function (error3, source, runtimeMs) {
          if (error3) return fail(error3);
          set('load.runtime', kib(source) + ' in ' + ms(runtimeMs));
          render('Starting Bitsy…');
          // Let the status show before the long synchronous parse and start.
          setTimeout(function () {
            start(source, gameData, fontData);
          }, 50);
        });
      });
    });
  }

  function start(source, gameData, fontData) {
    ik.ondraw = onDraw;
    ik.onidle = onIdle;
    ik.grayMode = gray;
    var script = document.createElement('script');
    script.text = source;
    var before = now();
    try {
      document.body.appendChild(script);
    } catch (e) {
      errors.push('runtime: ' + message(e));
    }
    var after = now();
    if (ik.runStart == null || !ik.start) {
      return fail(new Error('the runtime did not run (see errors)'));
    }
    set('runtime.parse', ms(ik.runStart - before));
    set('runtime.start', ms((ik.runEnd || after) - ik.runStart));
    try {
      ik.start($('game'), gameData, fontData);
    } catch (e) {
      fail(e);
    }
  }

  function fail(error) {
    errors.push(message(error));
    render('Failed: ' + message(error));
  }

  // --- Measures ----------------------------------------------------------------------------------------

  function onDraw() {
    if (ik.contrast != null && ik.roomName != null) contrasts[ik.roomName] = ik.contrast;
    if (ik.draws === 1) {
      set('firstDraw', ms(ik.firstDraw - ik.started) + ' after the game started');
      set('firstDraw.tick', ms(ik.tickMs) + ' (the game parsed), draw ' + ms(ik.drawMs));
      render('Running');
    }
  }

  function onIdle() {
    if (ik.inputs > loggedInputs) {
      loggedInputs = ik.inputs;
      var from = ik.inputRoom == null ? '?' : ik.inputRoom;
      var row =
        from +
        (ik.roomName !== from ? ' -> ' + ik.roomName : '') +
        (ik.dialog ? ' (dialogue)' : '') +
        ': first frame ' +
        ms(ik.response) +
        (ik.roomChange != null ? ', room ' + ms(ik.roomChange) : '') +
        ', idle ' +
        ms(ik.settle) +
        ' (' +
        ik.inputTicks +
        ' ticks, slowest tick ' +
        ms(ik.inputTickMs) +
        ', slowest draw ' +
        ms(ik.inputDrawMs) +
        ')';
      inputs.push(row);
      if (inputs.length > MAX_INPUTS) inputs.shift();
    }
    if (!findResult('idle.firstReached') && ik.started != null) {
      set('idle.firstReached', ms(now() - ik.started) + ' after the game started');
    }
    render('Idle — measuring 10 s');
    watchIdle();
  }

  // Ticks and draws over 10 s on a still room: both should stay at 0.
  function watchIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    var ticks = ik.ticks;
    var draws = ik.draws;
    var count = ik.inputs;
    var name = ik.roomName;
    idleTimer = setTimeout(function () {
      idleTimer = null;
      if (ik.inputs !== count) return;
      set(
        'idle.10s',
        ik.ticks - ticks + ' ticks, ' + (ik.draws - draws) + ' draws in "' + name + '"'
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
          '<p><b>' + label + '</b></p>' + qr.createImgTag(4, 16, 'Bitsy report QR code, ' + label);
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
  $('show-report').onclick = showReport;
  $('close-report').onclick = hideReport;
  countEvents();
  checkEnvironment();
  linkSettings();
  bindPad();
  fit();
  load();
})();
