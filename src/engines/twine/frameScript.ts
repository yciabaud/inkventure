// The script injected at the top of a Twine story's page (SPEC §4.3; story S1.9). It runs inside the sandboxed iframe,
// before the story format's own scripts, and talks to the reader only through `postMessage`:
// - storage: `localStorage` / `sessionStorage` are replaced by in-memory stores seeded with what the reader saved for
//   this story (the sandbox gives the frame an opaque origin, where the real ones throw). Every change is posted to
//   the reader, which keeps it in its own storage, so the story format's saves (and SugarCube's session) survive.
// - pages: a tap on the left 30 % of the page (outside links and controls) shows the previous screenful, elsewhere
//   the next one; the page number is posted to the reader. Scrolling is hidden only once this works, so a story that
//   breaks it still scrolls.
// - style: the reader sends a new e-ink stylesheet when the text settings change.
//
// Plain ES5 in a string: it runs in the story's page, outside the bundle and its transpilation.

import { FRAME_MESSAGE, STYLE_ID, type FrameStorage } from './messages';

/** The script for a frame starting with `storage`. */
export function frameScript(storage: FrameStorage): string {
  // `<` escaped: the data must not close the script element.
  const data = JSON.stringify(storage).replace(/</g, '\\u003c');
  return FRAME_SCRIPT.replace('__DATA__', data)
    .replace(/__SOURCE__/g, JSON.stringify(FRAME_MESSAGE))
    .replace(/__STYLE_ID__/g, JSON.stringify(STYLE_ID));
}

const FRAME_SCRIPT = `(function () {
  var SOURCE = __SOURCE__;
  var data = __DATA__;
  var has = Object.prototype.hasOwnProperty;

  function post(message) {
    message.source = SOURCE;
    try {
      window.parent.postMessage(message, '*');
    } catch (e) {}
  }

  // --- Storage ---
  var pending = {};
  var flushing = false;
  function flush() {
    flushing = false;
    for (var area in pending) {
      if (has.call(pending, area)) post({ type: 'storage', area: area, items: pending[area] });
    }
    pending = {};
  }
  function makeStorage(area) {
    var items = {};
    var saved = data[area] || {};
    for (var k in saved) if (has.call(saved, k)) items[k] = String(saved[k]);
    function changed() {
      pending[area] = items;
      if (!flushing) {
        flushing = true;
        setTimeout(flush, 0);
      }
    }
    function keys() {
      var list = [];
      for (var k in items) if (has.call(items, k)) list.push(k);
      return list;
    }
    var storage = {
      getItem: function (key) {
        key = String(key);
        return has.call(items, key) ? items[key] : null;
      },
      setItem: function (key, value) {
        items[String(key)] = String(value);
        changed();
      },
      removeItem: function (key) {
        delete items[String(key)];
        changed();
      },
      clear: function () {
        items = {};
        changed();
      },
      key: function (index) {
        var list = keys();
        return index >= 0 && index < list.length ? list[index] : null;
      }
    };
    try {
      Object.defineProperty(storage, 'length', { get: function () { return keys().length; } });
    } catch (e) {}
    return storage;
  }
  function install(name, storage) {
    try {
      Object.defineProperty(window, name, { configurable: true, enumerable: true, get: function () { return storage; } });
    } catch (e) {}
  }
  install('localStorage', makeStorage('local'));
  install('sessionStorage', makeStorage('session'));
  window.addEventListener('pagehide', flush);

  // --- Style ---
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (event.source !== window.parent || !message || message.source !== SOURCE) return;
    if (message.type === 'style' && typeof message.css === 'string') {
      var style = document.getElementById(__STYLE_ID__);
      if (style) style.textContent = message.css;
      report();
    }
  });

  // --- Pages ---
  var root = document.documentElement;
  var lastPage = 0;
  var lastPages = 0;
  function lineHeight() {
    var value = parseFloat(window.getComputedStyle(document.body).lineHeight);
    return value > 0 ? value : 24;
  }
  function step() {
    return Math.max(48, window.innerHeight - lineHeight());
  }
  function scrollTop() {
    return window.pageYOffset || root.scrollTop || 0;
  }
  function maxScroll() {
    return Math.max(0, Math.max(root.scrollHeight, document.body.scrollHeight) - window.innerHeight);
  }
  function report() {
    var s = step();
    var max = maxScroll();
    var pages = 1 + Math.ceil(max / s - 0.01);
    var page = scrollTop() >= max - 1 ? pages : 1 + Math.floor(scrollTop() / s + 0.01);
    if (page === lastPage && pages === lastPages) return;
    lastPage = page;
    lastPages = pages;
    post({ type: 'page', page: page, pages: pages });
  }
  var reporting = false;
  function reportSoon() {
    if (reporting) return;
    reporting = true;
    setTimeout(function () {
      reporting = false;
      report();
    }, 50);
  }
  function turn(direction) {
    var top = scrollTop() + direction * step();
    window.scrollTo(0, Math.max(0, Math.min(maxScroll(), top)));
    report();
  }
  var INTERACTIVE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY|TW-LINK|TW-ICON|TW-DIALOG|TW-SIDEBAR)$/;
  function interactive(node) {
    for (; node && node !== document.body && node.nodeType === 1; node = node.parentNode) {
      if (INTERACTIVE.test(node.nodeName.toUpperCase())) return true;
      if (node.getAttribute('onclick') || node.getAttribute('role') === 'button') return true;
      if (node.getAttribute('tabindex') !== null) return true;
      var cls = ' ' + (node.getAttribute('class') || '') + ' ';
      if (/ (link-internal|link-external|enchantment-link|macro-[a-z-]+|ui-close) /.test(cls)) return true;
    }
    return false;
  }
  function start() {
    root.className += (root.className ? ' ' : '') + 'ik-paged';
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button > 0 || interactive(event.target)) return;
      var selection = window.getSelection && window.getSelection();
      if (selection && String(selection).length > 0) return;
      turn(event.clientX < window.innerWidth * 0.3 ? -1 : 1);
    });
    window.addEventListener('scroll', reportSoon);
    window.addEventListener('resize', reportSoon);
    if (window.MutationObserver) {
      new MutationObserver(reportSoon).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    report();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
