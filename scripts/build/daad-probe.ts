// The DAAD probe (story S0.13), dist/probe/daad/: jDAAD patched to suit an e-ink reader, transpiled to ES2017. The page
// (index.html, probe.js) and our game (lamp-room.jddb, images.js, built by scripts/build/daad-game/) are static in
// public/probe/daad/.
//
// runtime.js is what jDAAD's index.html loads around the game: jQuery 3.6.0, font.js, an empty sound and video list
// (DAAD Ready's sounds.js and videos.js for a game with none), extern.js and jdaad.js, the last with the patches
// below, each of which must match the pinned upstream code exactly once: the build fails loudly when upstream moved.
// The whole file is then transpiled to ES2017 (jdaad.js uses class fields, ES2022), which the Kindle runs (SPEC §2.2).
//
// - Drawing: upstream draws every pixel of a picture or a character with its own `fillRect` (a 320 × 96 picture is
//   30,720 calls, each building a colour string; a character 48). Patched, every drawing goes to an in-memory copy
//   of each canvas (an ImageData), and the visible canvas gets only the rectangle that changed, once, when the
//   interpreter stops to wait (a `setTimeout(0)` after the first change). So nothing is drawn while the game waits.
// - No console log per condact (upstream logs each one: DEBUG_ENABLED).
// - The canvas is zoomed to the width without smoothing (resizeScreen), by the page's choice (fractional or whole
//   steps). No scanlines (they are page markup, left out).
// - The virtual keyboard is shown when the page says so (`ikDaad.keyboard`), not from `'ontouchstart' in
//   document.documentElement`, which is false on the Kindle although touch events fire (S0.3); its keys answer
//   touch and mouse once each (no `KeyboardEvent` built), and their size is the page's CSS. A tap on the picture
//   continues an ANYKEY or a "More..." pause on every device (upstream: only without the virtual keyboard).
// - The page can send keys (`ikDaad.key`), for the Kindle's own keyboard through a text field.
// - `ikDaad.paper = 'white'` swaps colours 0 and 15 (black and white), so the text is black on white.
// - Measures in `window.ikDaad`: draws and their time and area, pictures and their time, the location, and for the
//   last input the time to its first draw and to a location change.
// - Saves stay in jDAAD's own localStorage keys (probe only, outside the app's storage).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import type { Plugin } from 'vite';
import { DAAD_COMMIT, DAAD_VERSION } from './daad-files.ts';

type Replacement = [RegExp, string];

/** A pattern for upstream text, matched with any run of white space where the text has some. */
function loose(text: string): RegExp {
  const escaped = text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/\s+/g, '\\s*'));
}

// Inkventure's code, before jdaad.js: the frame buffers, the draw, the input and the measures.
const PRELUDE = `// Inkventure (S0.13, scripts/build/daad-probe.ts): in-memory frame buffers, one draw when the game waits.
var ik = window.ikDaad = window.ikDaad || {};
ik.draws = 0; ik.drawMs = 0; ik.drawArea = 0; ik.inputs = 0; ik.pictures = 0; ik.pictureMs = 0;
var IK_W = 320, IK_H = 200, ik_dirty = null, ik_pending = 0;
function ik_now() { return window.performance ? performance.now() : new Date().getTime(); }
// Each context gets an ImageData the size of the screen: the real canvas only gets what changed, from paper's.
function ik_px(ctx) {
  if (!ctx.ikImage) ctx.ikImage = ctx.createImageData(IK_W, IK_H);
  return ctx.ikImage.data;
}
function ik_mark(ctx, x, y, w, h) {
  if (ctx !== paper) return;
  var d = ik_dirty;
  if (!d) ik_dirty = [x, y, x + w, y + h];
  else { if (x < d[0]) d[0] = x; if (y < d[1]) d[1] = y; if (x + w > d[2]) d[2] = x + w; if (y + h > d[3]) d[3] = y + h; }
  if (!ik_pending) { ik_pending = 1; setTimeout(ik_flush, 0); }
}
function ik_clip(x, y, w, h) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.min(IK_W, Math.round(x + w)) - x; h = Math.min(IK_H, Math.round(y + h)) - y;
  return w > 0 && h > 0 ? [x, y, w, h] : null;
}
function ik_pixel(ctx, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= IK_W || y >= IK_H) return;
  x = x | 0; y = y | 0;
  var p = ik_px(ctx), i = (y * IK_W + x) * 4;
  p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = 255;
  ik_mark(ctx, x, y, 1, 1);
}
function ik_fill(ctx, x, y, w, h, rgb) {
  var c = ik_clip(x, y, w, h); if (!c) return;
  var p = ik_px(ctx);
  for (var j = c[1]; j < c[1] + c[3]; j++)
    for (var i = (j * IK_W + c[0]) * 4, end = i + c[2] * 4; i < end; i += 4) { p[i] = rgb[0]; p[i + 1] = rgb[1]; p[i + 2] = rgb[2]; p[i + 3] = 255; }
  ik_mark(ctx, c[0], c[1], c[2], c[3]);
}
// getImageData and putImageData on the in-memory copy (the window scroll).
function ik_get(ctx, x, y, w, h) {
  var c = ik_clip(x, y, w, h); if (!c) return null;
  var p = ik_px(ctx), out = new Uint8ClampedArray(c[2] * c[3] * 4);
  for (var j = 0; j < c[3]; j++) out.set(p.subarray(((c[1] + j) * IK_W + c[0]) * 4, ((c[1] + j) * IK_W + c[0] + c[2]) * 4), j * c[2] * 4);
  return { width: c[2], height: c[3], data: out };
}
function ik_put(ctx, img, x, y) {
  if (!img) return;
  var c = ik_clip(x, y, img.width, img.height); if (!c) return;
  var p = ik_px(ctx);
  for (var j = 0; j < c[3]; j++) p.set(img.data.subarray(j * img.width * 4, (j * img.width + c[2]) * 4), ((c[1] + j) * IK_W + c[0]) * 4);
  ik_mark(ctx, c[0], c[1], c[2], c[3]);
}
// drawImage(other.canvas, 0, 0) between the screen and the double buffers.
function ik_copy(to, from) { ik_px(to).set(ik_px(from)); ik_mark(to, 0, 0, IK_W, IK_H); }
// The one draw: the rectangle that changed since the last one.
function ik_flush() {
  ik_pending = 0;
  var d = ik_dirty; if (!d) return;
  ik_dirty = null;
  var t0 = ik_now();
  paper.putImageData(paper.ikImage, 0, 0, d[0], d[1], d[2] - d[0], d[3] - d[1]);
  var t1 = ik_now();
  ik.draws++; ik.drawMs = t1 - t0; ik.drawArea = (d[2] - d[0]) * (d[3] - d[1]);
  if (ik.firstDraw == null) ik.firstDraw = t1;
  var loc = flags.getFlag(FPLAYER);
  if (ik.input != null && ik.response == null) ik.response = t1 - ik.input;
  if (ik.input != null && ik.locChange == null && loc !== ik.inputLoc) ik.locChange = t1 - ik.input;
  ik.loc = loc;
  ik.waiting = inMORE ? 'more' : inANYKEY ? 'key' : inPARSE ? 'command' : inEND || inQUIT ? 'end' : inSAVE || inLOAD ? 'file' : isTerminated ? 'over' : '';
  if (ik.ondraw) ik.ondraw();
}
// DISPLAY, timed when it draws a picture.
function ik_DISPLAY() {
  var t0 = ik_now(), picture = Parameter1 == 0 && imageBufferID !== false;
  _DISPLAY();
  if (picture) { ik.pictures++; ik.pictureMs = ik_now() - t0; ik.picture = imageBufferID; }
}
function ik_input(kind) {
  ik.input = ik_now(); ik.inputs++; ik.inputKind = kind; ik.inputLoc = ik.loc;
  ik.response = null; ik.locChange = null; ik.inputDraws = ik.draws;
}
// A key from the page (the Kindle keyboard's text field) or the virtual keyboard: a plain object, as jDAAD reads
// only its key and its two methods.
function ik_event(key) { return { key: key, preventDefault: function () {}, stopPropagation: function () {} }; }
ik.key = function (key) { ik_input(key); keydownHandler(ik_event(key)); keyupHandler(ik_event(key)); };
function ik_bindKey(el) {
  var lastTouch = 0;
  function press(e) { e.preventDefault(); ik.key(getVirtualKeyboardKey(el.id)); }
  el.addEventListener('touchstart', function (e) { lastTouch = new Date().getTime(); e.stopImmediatePropagation(); press(e); });
  el.addEventListener('mousedown', function (e) { if (new Date().getTime() - lastTouch > 800) press(e); });
}
// The canvas across the width (or the height left by the keyboard), in whole steps if the page asks.
function ik_fit() {
  var screen = document.getElementById('screen'), canvas = document.getElementById('paper');
  var room = window.innerHeight - (ik.reserved ? ik.reserved() : 0);
  var zoom = Math.min(window.innerWidth / IK_W, room / IK_H);
  if (ik.wholeZoom) zoom = Math.max(1, Math.floor(zoom));
  canvas.style.width = Math.floor(IK_W * zoom) + 'px';
  canvas.style.height = Math.floor(IK_H * zoom) + 'px';
  ik.zoom = zoom;
}
`;

export const PATCHES: Replacement[] = [
  // No console log per condact.
  [
    loose('const DEBUG_ENABLED = true;'),
    'const DEBUG_ENABLED = false; // Inkventure: no log per condact',
  ],
  // DISPLAY timed.
  [
    loose("{condactName: 'DISPLAY', condactRoutine: _DISPLAY, numParams: 1},"),
    "{condactName: 'DISPLAY', condactRoutine: ik_DISPLAY, numParams: 1},",
  ],
  // Pixels go to the in-memory copy.
  [
    loose(`function pixelRGB(x, y, r, g, b, isText)
{
    var rhex = r.toString(16); if (rhex.length < 2) rhex = '0' + rhex;
    var ghex = g.toString(16); if (ghex.length < 2) ghex = '0' + ghex;
    var bhex = b.toString(16); if (bhex.length < 2) bhex = '0' + bhex;
    var colorCode = ('#' + rhex + ghex + bhex).toUpperCase() ;
    var currentContext = paper;`),
    'function pixelRGB(x, y, r, g, b, isText)\n{\n    var currentContext = paper;',
  ],
  [
    loose(`currentContext.fillStyle = colorCode;
    currentContext.fillRect(x,y,1,1);`),
    'ik_pixel(currentContext, x, y, r, g, b); // Inkventure: in memory',
  ],
  [
    loose(`paper.fillStyle = getFillStyle(paperColor);
    paper.fillRect(X, Y, width, height)`),
    'ik_fill(paper, X, Y, width, height, colours[paperColor]); // Inkventure: in memory',
  ],
  // The window scroll.
  [loose('var img = currentContext.getImageData('), 'var img = ik_get(currentContext, '],
  [loose('currentContext.putImageData(img, '), 'ik_put(currentContext, img, '],
  // The double buffer (GFX).
  [
    loose(`function DBBuffertoScreen() //Copy the buffer to the screen
{
    paper.drawImage(doublebuffer.canvas, 0, 0);`),
    'function DBBuffertoScreen() //Copy the buffer to the screen\n{\n    ik_copy(paper, doublebuffer);',
  ],
  [
    loose(`function DBScreentoBuffer() //Copy the screen to the buffer
{
    doublebuffer.drawImage(paper.canvas, 0, 0);`),
    'function DBScreentoBuffer() //Copy the screen to the buffer\n{\n    ik_copy(doublebuffer, paper);',
  ],
  [
    loose(`swapbuffer.drawImage(doublebuffer.canvas, 0, 0);
    doublebuffer.drawImage(paper.canvas, 0, 0);
    paper.drawImage(swapbuffer.canvas, 0, 0);`),
    'ik_copy(swapbuffer, doublebuffer);\n    ik_copy(doublebuffer, paper);\n    ik_copy(paper, swapbuffer);',
  ],
  [
    loose(`doublebuffer.fillStyle = getFillStyle(windows.windows[windows.activeWindow].PAPER);
    doublebuffer.fillRect(0, 0, 320, 200)`),
    'ik_fill(doublebuffer, 0, 0, 320, 200, colours[windows.windows[windows.activeWindow].PAPER]);',
  ],
  [
    loose(`paper.fillStyle = getFillStyle(windows.windows[windows.activeWindow].PAPER);
    paper.fillRect(0, 0, 320, 200)`),
    'ik_fill(paper, 0, 0, 320, 200, colours[windows.windows[windows.activeWindow].PAPER]);',
  ],
  // The canvas zoomed by the page.
  [
    loose(`function resizeScreen()
{`),
    'function resizeScreen()\n{\n    return ik_fit(); // Inkventure: across the width, without smoothing',
  ],
  // The virtual keyboard: no resizing of the screen, keys bound once for touch and mouse.
  [
    new RegExp(
      loose(`document.getElementById('screen').classList.remove("screenClass");`).source +
        '[\\s\\S]*?' +
        loose("$('#scanlines').hide();").source,
    ),
    "/* Inkventure: the page lays out the screen and the keyboard */\n    $('#virtualKeyboardDAAD').show();",
  ],
  [
    loose(`virtualKeys.forEach(function(key)
    {
        key.addEventListener('touchstart', function(e) {`),
    "virtualKeys.forEach(ik_bindKey);\n    if (0) virtualKeys.forEach(function(key)\n    {\n        key.addEventListener('touchstart', function(e) {",
  ],
  // Start: measures, colours, keyboard from the page, a tap on the picture continues.
  [
    loose("console.log('jDAAD 1.2 (C) Uto ' + versionDate);"),
    "ik.started = ik_now(); // Inkventure\n    if (ik.paper === 'white') { var ik_black = colours[0]; colours[0] = colours[15]; colours[15] = ik_black; }",
  ],
  [
    loose(`$(document).keydown(function(e) {
        keydownHandler(e);`),
    '$(document).keydown(function(e) {\n        ik_input(e.key);\n        keydownHandler(e);',
  ],
  [
    loose(`isMobileDevice = ('ontouchstart' in document.documentElement);
    if (isMobileDevice) initVirtualKeyboard();
    else
    {
        $(document).click(function(e)
        {
            clickHandler(e);
        });

    }`),
    'isMobileDevice = !!ik.keyboard; // Inkventure: the page says whether to show the keyboard\n' +
      '    if (isMobileDevice) initVirtualKeyboard();\n' +
      "    $('#screen').click(function(e)\n    {\n        if (inANYKEY) ik_input('tap');\n        clickHandler(e);\n    });",
  ],
  [
    loose(`document.getElementById('paper').focus();
    run(false);`),
    "document.getElementById('paper').focus();\n    run(false);\n    ik.firstRunMs = ik_now() - ik.started;",
  ],
];

/** Applies each replacement, which must match exactly once; throws naming the first one that does not. */
export function patchDaad(source: string, patches: Replacement[] = PATCHES): string {
  let out = source;
  for (const [pattern, replacement] of patches) {
    const global = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
    );
    const count = (out.match(global) || []).length;
    if (count !== 1) {
      throw new Error(
        `jDAAD patch ${pattern} matched ${count} times in jdaad.js, expected once (did upstream change?)`,
      );
    }
    out = out.replace(pattern, () => replacement);
  }
  return out;
}

/** The licence notice at the top of runtime.js (after transpiling, which drops ordinary comments). */
export const HEADER =
  '/* jDAAD ' +
  DAAD_VERSION +
  ' (commit ' +
  DAAD_COMMIT.slice(0, 8) +
  ') (c) Uto, GPL-3 licence (LICENSE-jdaad.txt); source: https://github.com/Utodev/jDAAD.\n' +
  ' * jQuery 3.6.0 (c) OpenJS Foundation and other contributors, MIT licence (jquery.org/license).\n' +
  ' * Patched for Inkventure and transpiled to ES2017: scripts/build/daad-probe.ts. */\n';

/** runtime.js before transpiling: jDAAD's scripts in its index.html's order, jdaad.js patched, with the probe's marks. */
export function buildSource(files: {
  jquery: string;
  font: string;
  extern: string;
  jdaad: string;
}): string {
  return [
    'window.ikDaad = window.ikDaad || {}; ikDaad.runStart = window.performance ? performance.now() : 0;',
    files.jquery,
    files.font,
    "// As DAAD Ready's sounds.js and videos.js for a game with neither.\nvar jDAADSounds = [];\nvar jDAADVideos = [];",
    files.extern,
    PRELUDE,
    patchDaad(files.jdaad),
    'ikDaad.runEnd = window.performance ? performance.now() : 0;',
  ].join('\n;\n');
}

/** Transpiles to ES2017 (the Kindle's engine, SPEC §2.2), keeping the code readable unless minified. */
export function transpile(source: string, minify = false): string {
  return transformSync(source, { target: 'es2017', loader: 'js', minify, legalComments: 'inline' })
    .code;
}

const VENDOR = 'vendor/daad';

function readVendor(name: string): string {
  const path = join(VENDOR, name);
  if (!existsSync(path)) {
    throw new Error(`${path} is missing: run \`npm install\` (scripts/build/fetch-daad.ts) first.`);
  }
  return readFileSync(path, 'utf8');
}

export function buildRuntime(read: (name: string) => string = readVendor): string {
  return (
    HEADER +
    transpile(
      buildSource({
        jquery: read('jquery-3.6.0.min.js'),
        font: read('font.js'),
        extern: read('extern.js'),
        jdaad: read('jdaad.js'),
      }),
    )
  );
}

/** The probe's generated files, by their path under dist/. */
export function probeFiles(): Record<string, string> {
  return {
    'probe/daad/runtime.js': buildRuntime(),
    'probe/daad/LICENSE-jdaad.txt': readVendor('LICENSE'),
  };
}

export function daadProbePlugin(): Plugin {
  return {
    name: 'inkventure-daad-probe',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0].replace(/^\//, '');
        if (!/^probe\/daad\/(runtime\.js|LICENSE-jdaad\.txt)$/.test(path)) return next();
        const type = path.endsWith('.js') ? 'text/javascript' : 'text/plain';
        res.setHeader('Content-Type', type + '; charset=utf-8');
        res.end(probeFiles()[path]);
      });
    },
    generateBundle() {
      for (const [fileName, source] of Object.entries(probeFiles())) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}
