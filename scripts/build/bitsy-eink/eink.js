/*
 * Inkventure (story S0.12): runs Bitsy's engine on an e-ink reader. Loaded after the engine (bitsy.js), which it
 * leaves unchanged; it only changes engine settings that are plain globals, and replaces the system layer's loop.
 *
 * - Loop: upstream calls `updateSystem` every 16 ms, forever (system.js `initSystem`). Here a tick runs on an
 *   animation frame only while something happens: an input is held or waits to be read, or a dialogue page is still
 *   being revealed. After two quiet ticks the loop stops; the next input starts it again. One tick per frame: a slow
 *   device slows the game down instead of piling up ticks. The time step is capped (MAX_STEP_MS), so a long idle does
 *   not count as time spent holding a key.
 * - Upstream system.js already draws only the memory blocks that changed (tiles, map layers, text box), so a tick that
 *   changes nothing draws nothing; the loop stopping is what saves the CPU.
 * - Dialogue: a page shows at once (the engine's own skip, as when a key is pressed during the reveal), not one
 *   character every 50 ms. Text effects ({wvy}, {shk}, {rbw}) are drawn still.
 * - Animated tiles and sprites stay on their first frame; exits jump to their room without the transition effect; no
 *   sound (scripts/build/bitsy-eink/sound.js).
 * - Palettes become grays. "stretch" (default): each room's colours by luminance, stretched so the darkest is black
 *   and the lightest white; the text box stays black and white. "lum": plain luminance. "off": upstream colours.
 * - Measures for the probe page in `window.ikBitsy`: ticks, draws, their last durations, the first draw, and for the
 *   last input the time to its first draw, to a room change, and to the loop going idle, with its number of ticks and
 *   its slowest tick and draw.
 */
/* global updateSystem:readonly, mainProcess:readonly, loadGame:readonly, dialogBuffer:readonly, state:readonly,
   room:readonly, player:readonly, dialogRenderer:readonly, tileColorStartIndex:readonly, backgroundIndex:readonly,
   prevTime:writable, initSystem:writable */
(function (ik) {
  'use strict';

  var MAX_STEP_MS = 100;
  var QUIET_TICKS = 2;

  function now() {
    return window.performance && performance.now ? performance.now() : new Date().getTime();
  }

  // --- Grays ---------------------------------------------------------------------------------------------------

  function luminance(r, g, b) {
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  /**
   * A gray copy of a Bitsy palette block (r, g, b per colour index). The room's `tileCount` colours start at
   * `tileStart` (upstream `tileColorStartIndex`); `background` (index 0) is the room's first colour again. Text colours
   * (1–3) and the rainbow (4–13) keep their luminance.
   */
  ik.grayPalette = function (palette, mode, tileStart, tileCount, background) {
    var out = palette.slice(0);
    if (mode === 'off') return out;
    var count = palette.length / 3;
    var i;
    for (i = 0; i < count; i++) {
      var y = luminance(palette[i * 3], palette[i * 3 + 1], palette[i * 3 + 2]);
      if (isNaN(y)) continue;
      out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = y;
    }
    if (mode !== 'stretch') return out;
    var low = 255;
    var high = 0;
    var end = Math.min(count, tileStart + tileCount);
    for (i = tileStart; i < end; i++) {
      low = Math.min(low, out[i * 3]);
      high = Math.max(high, out[i * 3]);
    }
    if (high - low < 1) return out;
    var stretch = function (index) {
      var v = Math.round(((out[index * 3] - low) * 255) / (high - low));
      v = Math.max(0, Math.min(255, v));
      out[index * 3] = out[index * 3 + 1] = out[index * 3 + 2] = v;
    };
    for (i = tileStart; i < end; i++) stretch(i);
    stretch(background);
    return out;
  };

  /** The smallest luminance gap between the current room's colours, as drawn (0–255): how well it reads. */
  ik.roomContrast = function (palette, tileStart, tileCount) {
    var values = [];
    for (var i = tileStart; i < tileStart + tileCount && i * 3 < palette.length; i++) {
      values.push(palette[i * 3]);
    }
    values.sort(function (a, b) {
      return a - b;
    });
    var gap = 255;
    for (var j = 1; j < values.length; j++) gap = Math.min(gap, values[j] - values[j - 1]);
    return values.length > 1 ? gap : null;
  };

  if (typeof updateSystem === 'undefined') return; // loaded alone (unit tests of the functions above)

  // --- Engine settings ---------------------------------------------------------------------------------------------

  // Engine globals (top-level `var`s of bitsy.js, so properties of window).
  window.animationTime = Infinity; // tiles and sprites keep their first frame
  window.transition = null; // exits jump to their room
  window.soundPlayer = null;
  // Text effects move with the renderer's own clock (private to dialog.js): keep it at 0, so they are drawn still.
  if (dialogRenderer) {
    var drawDialog = dialogRenderer.Draw;
    dialogRenderer.Draw = function (buffer, dt, disableOnPrint) {
      return drawDialog.call(this, buffer, 0, disableOnPrint);
    };
  }

  // --- Drawing ----------------------------------------------------------------------------------------------------

  var graphics = mainProcess.system._graphics;
  var drawStart = null;
  ik.grayMode = ik.grayMode || 'stretch';

  var setPalette = graphics.setPalette;
  function roomColours() {
    var pal = state && state.pal != null && window.palette ? window.palette[state.pal] : null;
    return pal && pal.colors ? pal.colors.length : 3;
  }

  graphics.setPalette = function (colours) {
    var count = roomColours();
    var grays = ik.grayPalette(colours, ik.grayMode, tileColorStartIndex, count, backgroundIndex);
    ik.contrast = ik.roomContrast(grays, tileColorStartIndex, count);
    setPalette(grays);
  };

  // The main canvas is drawn by clearCanvas (a whole redraw) or drawImage without a destination.
  var clearCanvas = graphics.clearCanvas;
  graphics.clearCanvas = function (color) {
    if (drawStart == null) drawStart = now();
    clearCanvas(color);
  };
  var drawImage = graphics.drawImage;
  graphics.drawImage = function (id, x, y, destId) {
    if (destId == null && drawStart == null) drawStart = now();
    drawImage(id, x, y, destId);
  };
  // Tiles and the text box are drawn into their own canvases first: count that as part of the draw.
  var createImage = graphics.createImage;
  graphics.createImage = function (id, width, height, pixels, useTextScale) {
    if (drawStart == null) drawStart = now();
    createImage(id, width, height, pixels, useTextScale);
  };

  function revealing() {
    return !!(dialogBuffer && dialogBuffer.IsActive() && !dialogBuffer.CanContinue());
  }

  function drawn(at) {
    ik.draws++;
    if (ik.firstDraw == null) ik.firstDraw = at;
    var name =
      state && state.room != null && room[state.room] ? room[state.room].name || state.room : null;
    if (ik.input != null && ik.response == null) ik.response = at - ik.input;
    if (ik.input != null && ik.roomName != null && name !== ik.roomName && ik.roomChange == null) {
      ik.roomChange = at - ik.input;
    }
    ik.roomName = name;
    if (ik.ondraw) ik.ondraw();
  }

  // --- Loop ---------------------------------------------------------------------------------------------------

  ik.ticks = 0;
  ik.draws = 0;
  ik.tickMs = 0;
  ik.drawMs = 0;
  ik.inputs = ik.inputs || 0;
  ik.awake = 0;
  var scheduled = 0;
  var quiet = 0;

  ik.scheduleFrame =
    ik.scheduleFrame ||
    function (fn) {
      if (window.requestAnimationFrame) window.requestAnimationFrame(fn);
      else setTimeout(fn, 16);
    };

  function schedule() {
    if (scheduled) return;
    scheduled = 1;
    ik.awake = 1;
    ik.scheduleFrame(tick);
  }

  ik.wake = function () {
    quiet = 0;
    schedule();
  };

  function tick() {
    scheduled = 0;
    var t0 = now();
    var wall = new Date().getTime();
    if (wall - prevTime > MAX_STEP_MS) prevTime = wall - MAX_STEP_MS;
    if (revealing()) dialogBuffer.Skip();
    drawStart = null;
    updateSystem();
    var t1 = now();
    ik.ticks++;
    ik.tickMs = t1 - t0;
    if (drawStart != null) {
      ik.drawMs = t1 - drawStart;
      drawn(t1);
    }
    // The slowest tick and draw since the last input.
    if (ik.input != null && ik.settle == null) {
      ik.inputTicks++;
      ik.inputTickMs = Math.max(ik.inputTickMs, ik.tickMs);
      if (drawStart != null) ik.inputDrawMs = Math.max(ik.inputDrawMs, ik.drawMs);
    }
    ik.dialog = !!(dialogBuffer && dialogBuffer.IsActive());
    if (ik.inputPending() || revealing()) quiet = 0;
    else quiet++;
    if (quiet < QUIET_TICKS) {
      schedule();
      return;
    }
    ik.awake = 0;
    if (ik.input != null && ik.settle == null) ik.settle = now() - ik.input;
    if (ik.onidle) ik.onidle();
  }

  // Upstream starts its 60 Hz interval here (startExportedGame: loadGame, then initSystem).
  initSystem = function () {
    prevTime = new Date().getTime();
    ik.wake();
  };

  /** Starts a game: the canvas to draw into, the game data and the default font's data. */
  ik.start = function (canvas, gameData, fontData) {
    ik.started = now();
    loadGame(canvas, gameData, fontData);
    initSystem();
  };

  ik.player = function () {
    var p = player();
    return { room: p.room, x: p.x, y: p.y };
  };
})(window.ikBitsy);
