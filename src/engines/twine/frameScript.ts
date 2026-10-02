// The script injected at the top of a Twine story's page (SPEC §4.3; story S1.9). It runs inside the sandboxed iframe,
// before the story format's own scripts, and talks to the reader only through `postMessage`:
// - storage: `localStorage` / `sessionStorage` are replaced by in-memory stores seeded with what the reader saved for
//   this story (the sandbox gives the frame an opaque origin, where the real ones throw). Every change is posted to
//   the reader, which keeps it in its own storage, so the story format's saves (and SugarCube's session) survive.
// - pages: a tap on the left 30 % of the page (outside links and controls) shows the previous screenful, elsewhere
//   the next one; the page number is posted to the reader. Scrolling is hidden only once this works, so a story that
//   breaks it still scrolls.
// - cookies: `document.cookie` throws, whatever the browser does in an opaque origin.
// - style: the reader sends a new e-ink stylesheet when the text settings change. Gradients are cleared and visible
//   borders turn black, and a link drawn only with symbols no font of the device has gets a label (story S1.14).
// - files (story S1.11): a relative `src` (img, source…) or `url(…)` in a `style` attribute that the story sets after
//   it loaded is sent to the reader, which answers with a `data:` URL when it names a file kept from the story's zip.
//
// Plain ES5 in a string: it runs in the story's page, outside the bundle and its transpilation.

import { FRAME_MESSAGE, STYLE_ID, type FrameStorage } from './messages';

/**
 * The script for a frame starting with `storage`; `assets` when the story has files of its own (story S1.11);
 * `symbolLink`, the label of a link drawn only with symbols the device cannot show and leading to no named passage
 * (story S1.14).
 */
export function frameScript(storage: FrameStorage, assets = false, symbolLink = 'Link'): string {
  // `<` escaped: the data must not close the script element.
  const data = JSON.stringify({
    local: storage.local,
    session: storage.session,
    assets: assets,
    symbolLink: symbolLink,
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
  function show(node, style) {
    var name = style.animationName || style.webkitAnimationName;
    if (name && name !== 'none' && parseFloat(style.opacity) < 0.1) node.style.setProperty('opacity', '1', 'important');
  }
  // Readable colours (story S1.14), what the e-ink stylesheet cannot tell apart: a gradient behind text is cleared (it
  // is never a picture, unlike a url(…); with no text, it is an icon or a decoration and stays), and a visible border
  // (a box, an outline) turns black. A transparent border, kept for spacing, stays transparent.
  var SIDES = ['top', 'right', 'bottom', 'left'];
  // Transparent, or already black: nothing to do.
  var CLEAR = /^(transparent|rgba\\(.*,\\s*0\\)|rgb\\(0,\\s*0,\\s*0\\))$/;
  function colours(node, style) {
    var image = style.backgroundImage || '';
    if (image.indexOf('gradient') >= 0 && image.indexOf('url(') < 0 && /\\S/.test(node.textContent || '')) {
      node.style.setProperty('background-image', 'none', 'important');
    }
    // A disabled control keeps the grey of the e-ink stylesheet.
    if (node.disabled) return;
    for (var i = 0; i < SIDES.length; i++) {
      var side = 'border-' + SIDES[i];
      var kind = style.getPropertyValue(side + '-style');
      if (!kind || kind === 'none' || kind === 'hidden' || !(parseFloat(style.getPropertyValue(side + '-width')) > 0)) continue;
      if (CLEAR.test(style.getPropertyValue(side + '-color'))) continue;
      node.style.setProperty(side + '-color', '#000', 'important');
    }
  }
  // A link drawn only with symbols that no font of the device has (Detritus's U+26DB on the Kindle) shows empty boxes:
  // it is labelled with the passage it leads to (SugarCube's data-passage, Harlowe's passage-name), or a generic word.
  // A symbol is missing when it draws nothing, or the same pixels as characters no font has (a box). Checked once the
  // story's web fonts are loaded, so an icon font still loading is not taken for a missing one.
  var LINKS = /^(A|TW-LINK|BUTTON)$/;
  var drawn = {};
  var loading = {};
  var canvas = null;
  function pixels(text, font) {
    var context = canvas.getContext('2d');
    context.clearRect(0, 0, 64, 64);
    context.font = font;
    context.fillText(text, 8, 48);
    return context.getImageData(0, 0, 64, 64).data;
  }
  // What the device draws for characters no font has: a box (.notdef) on some, nothing on others. U+0378 is
  // unassigned and U+10FFFD private, so only a catch-all font draws something real for them.
  var MISSING = ['\\uffff', '\\u0378', '\\udbff\\udffd'];
  var missing = {};
  function same(a, b) {
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function blank(a) {
    for (var i = 3; i < a.length; i += 4) if (a[i]) return false;
    return true;
  }
  function drawable(symbol, font) {
    var key = font + '|' + symbol;
    if (has.call(drawn, key)) return drawn[key];
    var result = true;
    try {
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
      }
      if (!has.call(missing, font)) {
        missing[font] = [];
        for (var i = 0; i < MISSING.length; i++) missing[font].push(pixels(MISSING[i], font));
      }
      var ink = pixels(symbol, font);
      result = !blank(ink);
      for (var j = 0; result && j < missing[font].length; j++) if (same(ink, missing[font][j])) result = false;
    } catch (e) {
      result = true;
    }
    drawn[key] = result;
    return result;
  }
  function symbols(node, style) {
    if (!LINKS.test(node.nodeName.toUpperCase()) || node.getAttribute('data-ik-label') !== null) return;
    var text = (node.textContent || '').replace(/\\s+/g, '');
    if (!text || text.length > 8) return;
    var font = style.fontStyle + ' ' + style.fontWeight + ' 32px ' + style.fontFamily;
    // A web font (an icon font) is loaded only once something on screen uses it: load it for this text first.
    var key = font + '|' + text;
    function loaded() {
      loading[key] = false;
      revealAll();
    }
    try {
      if (!has.call(loading, key) && !document.fonts.check(font, text)) {
        loading[key] = true;
        document.fonts.load(font, text).then(loaded, loaded);
        return;
      }
    } catch (e) {}
    if (loading[key] === true) return;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      // A surrogate pair is one symbol.
      var symbol = code >= 0xd800 && code < 0xdc00 ? text.substr(i++, 2) : text.charAt(i);
      if (drawable(symbol, font)) return;
    }
    var label = node.getAttribute('data-passage') || node.getAttribute('passage-name') || data.symbolLink;
    node.setAttribute('data-ik-label', node.textContent);
    if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', label);
    node.textContent = label;
  }
  function fix(node) {
    var style = getComputedStyle(node);
    show(node, style);
    colours(node, style);
    symbols(node, style);
  }
  function reveal(event) {
    if (event.target && event.target.nodeType === 1 && window.getComputedStyle) show(event.target, getComputedStyle(event.target));
  }
  document.addEventListener('animationend', reveal, true);
  document.addEventListener('webkitAnimationEnd', reveal, true);
  // Every element of the page (a Harlowe story may sit next to <body>), at the start and after a change; also in case
  // the browser does not report animations that end at once.
  var revealing = false;
  function revealAll() {
    if (revealing || !window.getComputedStyle) return;
    revealing = true;
    setTimeout(function () {
      revealing = false;
      var all = root.getElementsByTagName('*');
      for (var i = 0; i < all.length; i++) fix(all[i]);
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
