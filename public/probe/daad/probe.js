/*
 * Inkventure DAAD probe (story S0.13, SPEC §13).
 * Plain ES5 like the other probes. It loads our test game (lamp-room.jddb, images.js) and jDAAD patched for e-ink
 * (runtime.js, built by scripts/build/daad-probe.ts), and reports what the game costs on this device: download and
 * parse of each part, the runtime's start, the first draw, each input (time to its draw, to a new location and its
 * picture), and whether anything is drawn while the game waits (over 10 s).
 * The runtime reports through `window.ikDaad`; nothing here polls it.
 */
(function () {
  'use strict';

  var PROBE_VERSION = 1;
  var IDLE_WINDOW_MS = 10000;
  var MAX_INPUTS = 14;
  var HINTS = {
    key: 'Tap the picture or a key to continue',
    more: 'More… tap the picture to read on',
    command: 'Type a command, then Enter',
    end: 'Another go? Type Y or N, then Enter',
    file: 'Type a file name, then Enter',
    over: 'The game is over'
  };

  var results = [];
  var errors = [];
  var inputs = [];
  var events = { touchstart: 0, touchend: 0, mousedown: 0, click: 0, keydown: 0 };
  var field = { keydown: 0, unidentified: 0, input: 0, submit: 0 };
  var idleTimer = null;
  var loggedInputs = 0;
  var ik = (window.ikDaad = window.ikDaad || {});

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

  var paper = param('paper') === 'black' ? 'black' : 'white';
  var zoom = param('zoom') === 'whole' ? 'whole' : 'fit';
  var keyboard = param('keyboard') !== 'off';

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
    var lines = ['inkventure-daad-probe v' + PROBE_VERSION];
    for (var i = 0; i < results.length; i++) lines.push(results[i][0] + ': ' + results[i][1]);
    for (var t = 0; t < inputs.length; t++) lines.push('input.' + (t + 1) + ': ' + inputs[t]);
    var counts = [];
    for (var event in events) counts.push(event + ' ' + events[event]);
    lines.push('input.events: ' + counts.join(', '));
    var typed = [];
    for (var name in field) typed.push(name + ' ' + field[name]);
    lines.push('input.field: ' + typed.join(', '));
    if (errors.length) lines.push('errors: ' + errors.join(' | '));
    return lines.join('\n');
  }

  function render(status) {
    if (status) $('status').textContent = status;
    var live = [
      'location ' +
        (ik.loc == null ? '–' : ik.loc) +
        ', waiting for ' +
        (ik.waiting || '–') +
        ', zoom ' +
        (ik.zoom ? Math.round(ik.zoom * 100) / 100 : '–'),
      'draws ' + (ik.draws || 0) + ', last ' + ms(ik.drawMs) + ' (' + (ik.drawArea || 0) + ' px)',
      'pictures ' + (ik.pictures || 0) + ', last ' + ms(ik.pictureMs)
    ];
    if (inputs.length) live.push('last input: ' + inputs[inputs.length - 1]);
    $('live').textContent = live.join('\n');
    $('hint').textContent = HINTS[ik.waiting] || '';
  }

  // --- Environment --------------------------------------------------------------------------------------

  function checkEnvironment() {
    set('probe.startedAt', new Date().toUTCString());
    set('ua', navigator.userAgent);
    set(
      'viewport',
      window.innerWidth + 'x' + window.innerHeight + ' @' + (window.devicePixelRatio || 1)
    );
    set(
      'settings',
      'paper ' + paper + ', zoom ' + zoom + ', keyboard ' + (keyboard ? 'on' : 'off')
    );
    set('feature.ontouchstart', 'ontouchstart' in document.documentElement ? 'yes' : 'no');
    var keyboardEvent;
    try {
      keyboardEvent =
        new window.KeyboardEvent('keydown', { key: 'a' }).key === 'a' ? 'yes' : 'no key';
    } catch (e) {
      keyboardEvent = 'no (' + message(e) + ')';
    }
    set('feature.KeyboardEvent', keyboardEvent);
  }

  function countEvents() {
    function counter(name) {
      return function () {
        events[name]++;
      };
    }
    for (var name in events) document.addEventListener(name, counter(name), true);
  }

  // Keep the other settings when following a settings link.
  function linkSettings() {
    var links = document.getElementsByTagName('a');
    var current = { paper: paper, zoom: zoom };
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (!href || href.charAt(0) !== '?') continue;
      for (var key in current) {
        if (href.indexOf(key + '=') < 0) href += '&' + key + '=' + current[key];
      }
      if (!keyboard) href += '&keyboard=off';
      links[i].setAttribute('href', href);
    }
  }

  // --- The device's own keyboard, through a text field ------------------------------------------------
  // keydown with a real key is sent at once (and the field stays empty); where the device gives no key (Android-
  // style 'Unidentified'), the field's value is compared with the last one and the difference sent as keys.

  function bindField() {
    var input = $('type');
    var last = '';
    function send(key) {
      if (ik.key) ik.key(key);
    }
    input.addEventListener('keydown', function (e) {
      field.keydown++;
      var key = e.key;
      e.stopPropagation(); // not to jDAAD's own handler on the document
      if (key && (key.length === 1 || key === 'Enter' || key === 'Backspace')) {
        e.preventDefault();
        send(key);
      } else if (!key || key === 'Unidentified' || key === 'Process') {
        field.unidentified++;
      }
    });
    input.addEventListener('input', function () {
      field.input++;
      var value = input.value;
      var common = 0;
      while (common < last.length && common < value.length && last[common] === value[common]) {
        common++;
      }
      for (var b = last.length; b > common; b--) send('Backspace');
      for (var c = common; c < value.length; c++) send(value.charAt(c));
      last = value;
    });
    $('type-form').addEventListener('submit', function (e) {
      e.preventDefault();
      field.submit++;
      send('Enter');
      input.value = '';
      last = '';
    });
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

  // Runs a downloaded script as a <script> element; returns how long it took (parse and run).
  function runScript(name, source) {
    var script = document.createElement('script');
    script.text = source;
    var before = now();
    try {
      document.body.appendChild(script);
    } catch (e) {
      errors.push(name + ': ' + message(e));
    }
    return now() - before;
  }

  var FILES = [
    ['game', 'lamp-room.jddb'],
    ['images', 'images.js'],
    ['runtime', 'runtime.js']
  ];

  function load(index, sources) {
    if (index === FILES.length) return start(sources);
    var file = FILES[index];
    render('Downloading ' + file[1] + '…');
    get(file[1], function (error, source, took) {
      if (error) return fail(error);
      set('load.' + file[0], kib(source) + ' in ' + ms(took));
      sources[file[0]] = source;
      load(index + 1, sources);
    });
  }

  function start(sources) {
    render('Starting jDAAD…');
    // Let the status show before the long synchronous parses.
    setTimeout(function () {
      set('parse.game', ms(runScript('game', sources.game)));
      set('parse.images', ms(runScript('images', sources.images)));
      ik.keyboard = keyboard;
      ik.paper = paper;
      ik.wholeZoom = zoom === 'whole';
      ik.reserved = reserved;
      ik.ondraw = onDraw;
      if (keyboard) $('virtualKeyboardDAAD').style.display = 'block';
      var before = now();
      runScript('runtime', sources.runtime);
      if (ik.runStart == null || !ik.key) {
        return fail(new Error('the runtime did not run (see errors)'));
      }
      set('runtime.parse', ms(ik.runStart - before));
      set(
        'runtime.run',
        ms(ik.runEnd - ik.runStart) + ' (jQuery and the script, before the game starts)'
      );
      ik.loaded = now();
    }, 50);
  }

  // The height under the screen: the hint, jDAAD's keyboard and the text field.
  function reserved() {
    return (
      $('hint').offsetHeight +
      $('virtualKeyboardDAAD').offsetHeight +
      $('type-form').offsetHeight +
      12
    );
  }

  function fail(error) {
    errors.push(message(error));
    render('Failed: ' + message(error));
  }

  // --- Measures ----------------------------------------------------------------------------------------

  function onDraw() {
    if (ik.draws === 1) {
      set('start', ms(ik.started - ik.loaded) + ' from the script to jQuery ready');
      set('firstRun', ms(ik.firstRunMs) + ' (the game runs to its first wait)');
      set(
        'firstDraw',
        ms(ik.firstDraw - ik.started) +
          ' after the start; put ' +
          ms(ik.drawMs) +
          ', ' +
          ik.drawArea +
          ' px'
      );
      set('zoom', Math.round(ik.zoom * 1000) / 1000 + ' (' + $('paper').style.width + ')');
    }
    if (ik.pictures && ik.picture != null) {
      set('picture.' + ik.picture, ms(ik.pictureMs) + ' to draw in memory');
    }
    if (ik.inputs > loggedInputs && ik.response != null) {
      loggedInputs = ik.inputs;
      var kind = ik.inputKind === ' ' ? 'space' : ik.inputKind;
      var row =
        kind +
        ': draw ' +
        ms(ik.response) +
        ' (put ' +
        ms(ik.drawMs) +
        ', ' +
        ik.drawArea +
        ' px)' +
        (ik.locChange != null
          ? ', location ' + ik.inputLoc + ' -> ' + ik.loc + ' ' + ms(ik.locChange)
          : '') +
        ', then ' +
        (ik.waiting || '–');
      inputs.push(row);
      if (inputs.length > MAX_INPUTS) inputs.shift();
    }
    render('Running — measuring 10 s of waiting');
    watchIdle();
  }

  // Draws over 10 s while the game waits: should stay at 0.
  function watchIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    var draws = ik.draws;
    var count = ik.inputs;
    idleTimer = setTimeout(function () {
      idleTimer = null;
      if (ik.inputs !== count) return;
      set(
        'idle.10s',
        ik.draws -
          draws +
          ' draws while waiting for ' +
          (ik.waiting || '–') +
          ' at location ' +
          ik.loc
      );
      render('Waiting — 10 s measured');
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
          '<p><b>' + label + '</b></p>' + qr.createImgTag(4, 16, 'DAAD report QR code, ' + label);
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
  bindField();
  load(0, {});
})();
