// The page of a Decker deck's sandboxed frame (SPEC §4.3; story S1.29): web-decker's markup, the deck in its
// `<script language="decker">` block (where Decker reads it at start), and the two runtime scripts
// (scripts/build/decker-runtime.ts) inlined, so that the frame needs nothing from the network: an opaque-origin frame
// is not served by the app's Service Worker, but the reader fetched the scripts through it (offline, S5.3).

/** The runtime's two scripts, as text. */
export interface DeckerRuntime {
  lil: string;
  ui: string;
}

/** Messages from the frame (the bridge in decker-runtime.ts). */
export type DeckerMessage =
  | { ikDecker: 1; type: 'ready' }
  | { ikDecker: 1; type: 'title'; title: string }
  | { ikDecker: 1; type: 'save'; deck: string }
  | { ikDecker: 1; type: 'error'; message: string };

/** The message, if `data` is one from a Decker frame. */
export function deckerMessage(data: unknown): DeckerMessage | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.ikDecker !== 1) return null;
  if (message.type === 'ready') return { ikDecker: 1, type: 'ready' };
  if (message.type === 'title' && typeof message.title === 'string')
    return { ikDecker: 1, type: 'title', title: message.title };
  if (message.type === 'save' && typeof message.deck === 'string')
    return { ikDecker: 1, type: 'save', deck: message.deck };
  if (message.type === 'error')
    return { ikDecker: 1, type: 'error', message: String(message.message) };
  return null;
}

/** Text that is safe inside a `<script>` element: no `</script` can close it early. */
export function scriptText(text: string): string {
  return text.replace(/<\/(script)/gi, '<\\/$1');
}

const STYLE =
  'html,body{margin:0;padding:0;background:#fff;height:100%;overflow:hidden;' +
  '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
  'canvas{display:none}' +
  '#display{display:block;margin:0 auto;touch-action:none;' +
  'image-rendering:-webkit-optimize-contrast;image-rendering:crisp-edges;image-rendering:pixelated}';

/** The frame's page for `deck` (Decker's text format). */
export function deckerHtml(deck: string, runtime: DeckerRuntime): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>' +
    STYLE +
    '</style></head><body>' +
    // Decker's own markup (js/decker.html): the runtime finds these by id.
    '<a id="target" style="display:none"></a><img id="loader" style="display:none" alt="">' +
    '<input id="source" type="file" style="display:none">' +
    '<canvas id="render"></canvas><canvas id="lrender"></canvas><canvas id="rrender"></canvas>' +
    '<canvas width="0" height="0" id="ltools"></canvas><canvas id="display"></canvas>' +
    '<canvas width="0" height="0" id="rtools"></canvas>' +
    '<script language="decker" type="text/x-decker">\n' +
    scriptText(deck) +
    '</script>' +
    '<script>' +
    scriptText(runtime.lil) +
    '</script><script>' +
    scriptText(runtime.ui) +
    '</script></body></html>'
  );
}

/**
 * The deck in a Decker file: a deck as Decker writes it (`{deck}` first), or a web export's page holding it in a
 * `<script language="decker">` block. Null when there is none.
 */
export function deckText(file: string): string | null {
  const text = file.replace(/^\uFEFF/, '');
  if (/^\s*\{deck\}/.test(text)) return text;
  const match = /<script[^>]*language\s*=\s*["']?decker["']?[^>]*>([\s\S]*?)<\/script>/i.exec(text);
  if (!match) return null;
  const deck = match[1].replace(/^\s+/, '');
  return /^\{deck\}/.test(deck) ? deck : null;
}
