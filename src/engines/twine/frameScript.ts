// The script injected at the top of a Twine story's page (SPEC §4.3; story S1.9). It runs inside the sandboxed iframe,
// before the story format's own scripts, and talks to the reader only through `postMessage`:
// - storage: `localStorage` / `sessionStorage` are replaced by in-memory stores seeded with what the reader saved for
//   this story (the sandbox gives the frame an opaque origin, where the real ones throw). Every change is posted to
//   the reader, which keeps it in its own storage, so the story format's saves (and SugarCube's session) survive.
// - pages: a tap on the left 30 % of the page (outside links and controls) shows the previous screenful, elsewhere
//   the next one; the page number is posted to the reader. Scrolling is hidden only once this works, so a story that
//   breaks it still scrolls.
// - cookies: `document.cookie` throws, whatever the browser does in an opaque origin.
// - style: the reader sends a new e-ink stylesheet when the text settings change.
// - files (story S1.11): a relative `src` (img, source…) or `url(…)` in a `style` attribute that the story sets after
//   it loaded is sent to the reader, which answers with a `data:` URL when it names a file kept from the story's zip.
//
// Plain ES5 in a string: it runs in the story's page, outside the bundle and its transpilation.

import { FRAME_MESSAGE, STYLE_ID, type FrameStorage } from './messages';

/** The script for a frame starting with `storage`; `assets` when the story has files of its own (story S1.11). */
export function frameScript(storage: FrameStorage, assets = false): string {
  // `<` escaped: the data must not close the script element.
  const data = JSON.stringify({
    local: storage.local,
    session: storage.session,
    assets: assets,
  }).replace(/</g, '\\u003c');
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
  // No cookies: the opaque origin already refuses them (Chromium throws, WebKit gives an empty jar); throw everywhere.
  function noCookies() {
    throw new Error('No cookies in the reader');
  }
  try {
    Object.defineProperty(document, 'cookie', { configurable: true, get: noCookies, set: noCookies });
  } catch (e) {}
  window.addEventListener('pagehide', flush);

  // --- Style ---
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (event.source !== window.parent || !message || message.source !== SOURCE) return;
    if (message.type === 'style' && typeof message.css === 'string') {
      var style = document.getElementById(__STYLE_ID__);
      if (style) style.textContent = message.css;
      report();
    } else if (message.type === 'asset' && typeof message.ref === 'string' && typeof message.url === 'string') {
      served(message.ref, message.url);
    }
  });

  // --- Files ---
  var RELATIVE = /^(?![a-z][a-z0-9+.-]*:|[\\/#])\\S/i;
  var STYLE_URL = /url\\(\\s*["']?([^"')]+)["']?\\s*\\)/gi;
  var asked = {};
  var waiting = {};
  function ask(ref, apply) {
    if (!has.call(waiting, ref)) waiting[ref] = [];
    waiting[ref].push(apply);
    if (has.call(asked, ref)) return;
    asked[ref] = true;
    post({ type: 'asset', ref: ref });
  }
  function served(ref, url) {
    var list = waiting[ref] || [];
    delete waiting[ref];
    for (var i = 0; i < list.length; i++) list[i](url);
  }
  function watchElement(node) {
    if (!node || node.nodeType !== 1) return;
    var name = node.nodeName.toUpperCase();
    if (name === 'IMG' || name === 'SOURCE' || name === 'VIDEO' || name === 'INPUT') {
      var src = node.getAttribute('src');
      if (src && RELATIVE.test(src)) {
        ask(src, function (url) {
          if (node.getAttribute('src') === src) node.setAttribute('src', url);
        });
      }
    }
    var inline = node.getAttribute('style');
    if (inline && inline.indexOf('url(') >= 0) {
      var match;
      STYLE_URL.lastIndex = 0;
      while ((match = STYLE_URL.exec(inline))) {
        (function (ref) {
          if (!RELATIVE.test(ref)) return;
          ask(ref, function (url) {
            var now = node.getAttribute('style') || '';
            node.setAttribute('style', now.split(ref).join(url));
          });
        })(match[1]);
      }
    }
  }
  function watchTree(node) {
    watchElement(node);
    if (node && node.getElementsByTagName) {
      var all = node.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) watchElement(all[i]);
    }
  }
  // From the start, only for a story with files.
  if (data.assets && window.MutationObserver) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type === 'attributes') watchElement(record.target);
        else for (var j = 0; j < record.addedNodes.length; j++) watchTree(record.addedNodes[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
  }

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
  // Animations jump to their end state (e-ink stylesheet). One that ends invisible (a loop stopped on its last frame,
  // a fade in and out) would hide its text for good: the element is shown instead.
  function show(node) {
    var style = getComputedStyle(node);
    var name = style.animationName || style.webkitAnimationName;
    if (name && name !== 'none' && parseFloat(style.opacity) < 0.1) node.style.setProperty('opacity', '1', 'important');
  }
  function reveal(event) {
    if (event.target && event.target.nodeType === 1 && window.getComputedStyle) show(event.target);
  }
  document.addEventListener('animationend', reveal, true);
  document.addEventListener('webkitAnimationEnd', reveal, true);
  // In case the browser does not report animations that end at once: every element of the page (a Harlowe story may
  // sit next to <body>), after a change.
  var revealing = false;
  function revealAll() {
    if (revealing || !window.getComputedStyle) return;
    revealing = true;
    setTimeout(function () {
      revealing = false;
      var all = root.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) show(all[i]);
    }, 50);
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
      new MutationObserver(function () {
        reportSoon();
        revealAll();
      }).observe(root, { childList: true, subtree: true, characterData: true });
    }
    revealAll();
    report();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
