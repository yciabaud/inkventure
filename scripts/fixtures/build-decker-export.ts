// `npm install` / `npm ci` postinstall: builds the zipped Decker web export of the sample catalogue (story S2.9),
// tests/fixtures/decker/tour.zip, from the tour deck (vendor/decker/tour.deck, fetched just before): laid out as
// Decker's web export (a page with the deck in a `<script language="decker">` block and the runtime inline). The runtime
// is a stand-in: the app never runs an export's scripts (the reader runs its own). A fixed date, so the zip only changes
// with its content. Not committed (built at install).
import { zipSync } from 'fflate';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'tests/fixtures/decker/tour.zip';

const deck = readFileSync('vendor/decker/tour.deck', 'utf8');
const page = `<html><head><meta charset="UTF-8"><title>The Decker Tour</title></head>
<body>
<script language="decker">
${deck}</script>
<script>
// Stand-in for Decker's runtime: never run by the app.
throw new Error('the export ran');
</script>
</body></html>
`;
const text = (value: string) => new TextEncoder().encode(value);
const mtime = new Date('2026-01-01T00:00:00Z');
const zip = zipSync({ 'tour.html': [text(page), { mtime: mtime }] }, { level: 6 });
mkdirSync('tests/fixtures/decker', { recursive: true });
if (!existsSync(OUT) || Buffer.compare(readFileSync(OUT), zip) !== 0) {
  writeFileSync(OUT, zip);
  console.log('Built ' + OUT);
}
