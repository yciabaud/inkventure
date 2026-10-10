/*
 * Inkventure (story S0.12): Bitsy's input system for an e-ink reader, in place of upstream system/input.js.
 * Loaded before upstream system.js, which creates one `new InputSystem()` and reads it once per tick.
 *
 * Upstream reads keys and swipes as they are held at the moment of a tick. On a slow device a tap can start and end
 * between two ticks, so every press is also latched until the next tick has read it (`resetTapReleased`, which
 * system.js calls at the end of each tick's input update). Input comes from keys, a tap on the game, and the probe
 * page's on-screen pad (`ikBitsy.press` / `ikBitsy.release`). Swipes and the restart combo are left out.
 * Each input wakes the loop (scripts/build/bitsy-eink/eink.js).
 */
var ikBitsy = (window.ikBitsy = window.ikBitsy || {});

ikBitsy.Key = {
  LEFT: 37,
  RIGHT: 39,
  UP: 38,
  DOWN: 40,
  SPACE: 32,
  ENTER: 13,
  W: 87,
  A: 65,
  S: 83,
  D: 68,
  R: 82,
  SHIFT: 16,
  CTRL: 17,
  ALT: 18,
  CMD: 224,
};

ikBitsy.keys = { held: {}, latched: {}, tap: false };

ikBitsy.wake = ikBitsy.wake || function () {};

ikBitsy.press = function (code) {
  ikBitsy.keys.held[code] = true;
  ikBitsy.keys.latched[code] = true;
  ikBitsy.onInput();
};

ikBitsy.release = function (code) {
  delete ikBitsy.keys.held[code];
  ikBitsy.wake();
};

ikBitsy.tap = function () {
  ikBitsy.keys.tap = true;
  ikBitsy.onInput();
};

/** True while a key or button is held, or a press or tap waits for a tick to read it. */
ikBitsy.inputPending = function () {
  var keys = ikBitsy.keys;
  if (keys.tap) return true;
  for (var held in keys.held) return true;
  for (var latched in keys.latched) return true;
  return false;
};

ikBitsy.onInput = function () {
  var now = window.performance && performance.now ? performance.now() : new Date().getTime();
  ikBitsy.input = now;
  ikBitsy.inputs = (ikBitsy.inputs || 0) + 1;
  ikBitsy.inputRoom = ikBitsy.roomName;
  ikBitsy.response = null;
  ikBitsy.roomChange = null;
  ikBitsy.settle = null;
  ikBitsy.inputTicks = 0;
  ikBitsy.inputTickMs = 0;
  ikBitsy.inputDrawMs = 0;
  ikBitsy.wake();
};

function InputSystem() {
  var Key = (this.Key = ikBitsy.Key);
  var keys = ikBitsy.keys;
  var directions = [Key.UP, Key.DOWN, Key.LEFT, Key.RIGHT, Key.W, Key.S, Key.A, Key.D];

  function isModifier(code) {
    return code === Key.SHIFT || code === Key.CTRL || code === Key.ALT || code === Key.CMD;
  }

  function onkeydown(e) {
    if (isModifier(e.keyCode) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.keyCode >= 37 && e.keyCode <= 40) e.preventDefault();
    if (keys.held[e.keyCode]) return; // auto-repeat
    ikBitsy.press(e.keyCode);
  }

  function onkeyup(e) {
    ikBitsy.release(e.keyCode);
  }

  function ontap(e) {
    e.preventDefault();
    ikBitsy.tap();
  }

  var lastTouch = 0;
  function ontouchend(e) {
    lastTouch = new Date().getTime();
    ontap(e);
  }
  function onmouseup(e) {
    // A touch is followed by compatibility mouse events: count the tap once.
    if (new Date().getTime() - lastTouch < 800) return;
    ontap(e);
  }

  this.isKeyDown = function (code) {
    return !!(keys.held[code] || keys.latched[code]);
  };

  this.anyKeyDown = function () {
    var codes = [keys.held, keys.latched];
    for (var i = 0; i < codes.length; i++) {
      for (var code in codes[i]) {
        if (directions.indexOf(Number(code)) < 0) return true;
      }
    }
    return false;
  };

  this.isTapReleased = function () {
    return keys.tap;
  };

  // Called once per tick, after the tick read its input: the latched presses have been seen.
  this.resetTapReleased = function () {
    keys.tap = false;
    keys.latched = {};
  };

  this.isRestartComboPressed = function () {
    return false;
  };

  this.swipeLeft =
    this.swipeRight =
    this.swipeUp =
    this.swipeDown =
      function () {
        return false;
      };

  this.ignoreHeldKeys = function () {};

  function resetAll() {
    keys.held = {};
    keys.latched = {};
    keys.tap = false;
  }

  this.resetAll = resetAll;
  this.onblur = resetAll;

  this.listen = function (canvas) {
    document.addEventListener('keydown', onkeydown);
    document.addEventListener('keyup', onkeyup);
    canvas.addEventListener('touchend', ontouchend);
    canvas.addEventListener('mouseup', onmouseup);
    window.onblur = resetAll;
  };

  this.unlisten = function (canvas) {
    document.removeEventListener('keydown', onkeydown);
    document.removeEventListener('keyup', onkeyup);
    canvas.removeEventListener('touchend', ontouchend);
    canvas.removeEventListener('mouseup', onmouseup);
    window.onblur = null;
  };
}
