// TEMPORARY (S1.11 first step): lists a Twine zip's entries and what its primary references. Removed before merge.
/* global fetch, console */
import { unzipSync, strFromU8 } from 'fflate';

const url = 'https://ifarchive.org/if-archive/games/springthing/2024/DoctorJeangillesLetters.zip';
const response = await fetch(url, { headers: { 'User-Agent': 'Inkventure S1.11 probe' } });
console.log('HTTP', response.status, 'CORS', response.headers.get('access-control-allow-origin'));
const zip = unzipSync(new Uint8Array(await response.arrayBuffer()));
let total = 0;
for (const [name, data] of Object.entries(zip)) {
  total += data.length;
  console.log('ENTRY', String(data.length).padStart(9), name);
}
console.log('TOTAL', total);
const html = strFromU8(zip['DoctorJeangillesLetters/index.html']);
console.log('HTML size', html.length);
const refs = new Set();
for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"'#][^"']*)["']/gi))
  refs.add('attr ' + m[1]);
for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi))
  refs.add('url ' + m[1].slice(0, 120));
for (const m of html.matchAll(/@import\s+[^;]+;/gi)) refs.add('import ' + m[0].slice(0, 160));
for (const m of html.matchAll(/\[img\[[^\]]*\]/gi)) refs.add('img ' + m[0].slice(0, 160));
for (const ref of [...refs].sort()) console.log('REF', ref);
for (const m of html.matchAll(/@font-face\s*{[^}]*}/gi))
  console.log('FONTFACE', m[0].replace(/\s+/g, ' ').slice(0, 300));
const families = new Set(
  [...html.matchAll(/font-family\s*:\s*([^;}<"]+)/gi)].map((m) => m[1].trim().slice(0, 80)),
);
for (const f of families) console.log('FAMILY', f);
// The story's stylesheet and the first passage, to see where symbols come from.
const style = /<style[^>]*id=["']twine-user-stylesheet["'][^>]*>([\s\S]*?)<\/style>/i.exec(html);
console.log('USER STYLESHEET (first 3000):\n' + (style ? style[1].slice(0, 3000) : 'none'));
const script = /<script[^>]*id=["']twine-user-script["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
console.log('USER SCRIPT (first 3000):\n' + (script ? script[1].slice(0, 3000) : 'none'));
const passages = [...html.matchAll(/<tw-passagedata([^>]*)>([\s\S]*?)<\/tw-passagedata>/gi)];
console.log('PASSAGES', passages.length);
for (const p of passages.slice(0, 6))
  console.log('PASSAGE', p[1].trim(), '\n', p[2].slice(0, 1200), '\n---');
// Other text files' references (css / html / js in the zip).
for (const [name, data] of Object.entries(zip)) {
  if (!/\.(css|html?|js)$/i.test(name) || name.endsWith('index.html')) continue;
  const text = strFromU8(data);
  const own = new Set(
    [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map((m) => m[1].slice(0, 120)),
  );
  console.log('FILE', name, [...own].slice(0, 30).join(' | '));
}
