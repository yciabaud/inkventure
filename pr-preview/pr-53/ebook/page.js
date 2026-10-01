(function () {
var exports = {};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORMATS = void 0;
exports.pickLocale = pickLocale;
exports.formatSize = formatSize;
exports.formatDate = formatDate;
exports.parseManifest = parseManifest;
exports.pageModel = pageModel;
exports.render = render;
exports.start = start;
exports.FORMATS = ['epub', 'azw3'];
function fill(text, params) {
    return text.replace(/\{(\w+)\}/g, function (match, name) {
        return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : match;
    });
}
function pickLocale(requested, languages, locales) {
    if (requested && locales.indexOf(requested) >= 0)
        return requested;
    for (var i = 0; i < languages.length; i++) {
        var base = String(languages[i]).toLowerCase().split('-')[0];
        if (locales.indexOf(base) >= 0)
            return base;
    }
    return locales[0];
}
function formatSize(bytes, strings) {
    if (bytes < 1024 * 1024) {
        return fill(strings['ebookPage.kb'], { size: String(Math.max(1, Math.round(bytes / 1024))) });
    }
    var mb = (bytes / (1024 * 1024)).toFixed(1).replace('.', strings['ebookPage.decimal']);
    return fill(strings['ebookPage.mb'], { size: mb });
}
function formatDate(iso, locale) {
    var date = new Date(iso);
    if (isNaN(date.getTime()))
        return iso.slice(0, 10);
    try {
        return date.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
    }
    catch (_a) {
        return iso.slice(0, 10);
    }
}
function parseManifest(text) {
    if (!text)
        return null;
    try {
        var data = JSON.parse(text);
        return data && Object.prototype.toString.call(data.books) === '[object Array]' ? data : null;
    }
    catch (_a) {
        return null;
    }
}
function pageModel(manifest, strings, locale, locales) {
    var order = [locale].concat(locales.filter(function (other) {
        return other !== locale;
    }));
    var books = manifest ? manifest.books : [];
    var blocks = order.map(function (bookLocale) {
        var block = {
            locale: bookLocale,
            title: strings['ebookPage.edition.' + bookLocale],
            buttons: exports.FORMATS.map(function (format) {
                var button = {
                    format: format,
                    label: fill(strings['ebookPage.download'], {
                        format: strings['ebookPage.format.' + format],
                    }),
                    hint: strings['ebookPage.hint.' + format],
                };
                for (var i = 0; i < books.length; i++) {
                    var book = books[i];
                    if (book.locale !== bookLocale || book.format !== format)
                        continue;
                    button.href = book.file;
                    button.info = fill(strings['ebookPage.fileInfo'], {
                        size: formatSize(book.size, strings),
                        date: formatDate(book.built, locale),
                    });
                }
                return button;
            }),
        };
        var cover = manifest && manifest.covers && manifest.covers[bookLocale];
        if (cover)
            block.cover = cover;
        return block;
    });
    return { locale: locale, available: books.length > 0, blocks: blocks };
}
function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className)
        node.className = className;
    if (text)
        node.appendChild(doc.createTextNode(text));
    return node;
}
function render(root, model, all) {
    var doc = root.ownerDocument;
    var strings = all[model.locale];
    root.innerHTML = '';
    var header = element(doc, 'div', 'header');
    header.appendChild(element(doc, 'h1', '', strings['ebookPage.title']));
    var languages = element(doc, 'p', 'languages');
    languages.setAttribute('aria-label', strings['ebookPage.language']);
    for (var other in all) {
        if (!Object.prototype.hasOwnProperty.call(all, other))
            continue;
        var link = element(doc, 'a', 'language', all[other]['ebookPage.languageName']);
        link.href = '?lang=' + other;
        link.setAttribute('hreflang', other);
        link.setAttribute('lang', other);
        if (other === model.locale)
            link.setAttribute('aria-current', 'true');
        languages.appendChild(link);
    }
    header.appendChild(languages);
    root.appendChild(header);
    root.appendChild(element(doc, 'p', 'intro', strings['ebookPage.intro']));
    if (!model.available) {
        root.appendChild(element(doc, 'p', 'unavailable', strings['ebookPage.unavailable']));
    }
    for (var b = 0; b < model.blocks.length; b++) {
        var block = model.blocks[b];
        var section = element(doc, 'div', 'book');
        section.setAttribute('data-locale', block.locale);
        if (block.cover) {
            var cover = doc.createElement('img');
            cover.className = 'cover';
            cover.src = block.cover;
            cover.alt = '';
            section.appendChild(cover);
        }
        var body = element(doc, 'div', 'book-body');
        body.appendChild(element(doc, 'h2', '', block.title));
        body.appendChild(element(doc, 'p', 'description', strings['ebookPage.description']));
        for (var i = 0; i < block.buttons.length; i++) {
            var button = block.buttons[i];
            var row = element(doc, 'div', 'format');
            row.setAttribute('data-format', button.format);
            if (button.href) {
                var link = element(doc, 'a', 'button', button.label);
                link.href = button.href;
                link.setAttribute('download', '');
                row.appendChild(link);
                row.appendChild(element(doc, 'p', 'info', button.info + ' — ' + button.hint));
            }
            else {
                row.appendChild(element(doc, 'span', 'button button--disabled', button.label));
                row.appendChild(element(doc, 'p', 'info', strings['ebookPage.notAvailable']));
            }
            body.appendChild(row);
        }
        section.appendChild(body);
        root.appendChild(section);
    }
    root.appendChild(element(doc, 'h2', '', strings['ebookPage.howTitle']));
    var steps = ['ebookPage.howUsb', 'ebookPage.howWireless', 'ebookPage.howOpen'];
    for (var s = 0; s < steps.length; s++)
        root.appendChild(element(doc, 'p', '', strings[steps[s]]));
    var app = element(doc, 'a', 'button', strings['ebookPage.openApp']);
    app.href = '../';
    root.appendChild(app);
}
function start(win, all) {
    var doc = win.document;
    var locales = [];
    for (var locale_1 in all) {
        if (Object.prototype.hasOwnProperty.call(all, locale_1))
            locales.push(locale_1);
    }
    var query = /[?&]lang=([a-z]+)/.exec(win.location.search);
    var nav = win.navigator;
    var languages = nav.languages && nav.languages.length
        ? nav.languages
        : [nav.language || nav.userLanguage || ''];
    var locale = pickLocale(query ? query[1] : null, Array.prototype.slice.call(languages), locales);
    doc.documentElement.setAttribute('lang', locale);
    doc.title = all[locale]['ebookPage.title'];
    var root = doc.getElementById('page');
    var draw = function (text) {
        render(root, pageModel(parseManifest(text), all[locale], locale, locales), all);
    };
    var request = new XMLHttpRequest();
    request.onreadystatechange = function () {
        if (request.readyState !== 4)
            return;
        draw(request.status === 200 ? request.responseText : null);
    };
    try {
        request.open('GET', 'books.json', true);
        request.send();
    }
    catch (_a) {
        draw(null);
    }
}

exports.start(window, window.INKVENTURE_EBOOK_STRINGS);
})();
