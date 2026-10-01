// `npm install` / `npm ci` postinstall: builds the Twine test fixtures (tests/fixtures/twine/*.twee → *.html, and
// lamp-files.twee → lamp-files.zip, a story with files of its own: story S1.11) with
// their story formats, downloaded once from the Story Format Archive into vendor/twine/ and checked against the
// SHA-256 it publishes. The built files are not committed (they embed the formats' minified code). Exits 1, with the
// reason, when a format cannot be fetched. Run again by hand after editing a .twee: node scripts/fixtures/build-twine.ts
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encodeGrayPng } from '../ebook/png.ts';
import { formatSource, parseTwee, publish } from './twee.ts';

const ARCHIVE =
  'https://raw.githubusercontent.com/videlais/story-formats-archive/refs/heads/docs/official/twine2/';
const CACHE = 'vendor/twine';

const FIXTURES = [
  {
    twee: 'tests/fixtures/twine/lamp-harlowe.twee',
    html: 'tests/fixtures/twine/lamp-harlowe.html',
    format: 'harlowe/3.3.9/format.js',
    sha256: '803a0d9d4fb8c3c1c99eaf16f37db6feaad72e36fc7e5f6c5a168465419895f3',
  },
  {
    twee: 'tests/fixtures/twine/lamp-sugarcube.twee',
    html: 'tests/fixtures/twine/lamp-sugarcube.html',
    format: 'sugarcube/2.37.3/format.js',
    sha256: '64ccdac806a162d250273aba3c39aee85765fedab4cf70e6176154a8c34b8820',
  },
];

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The story format, from the cache when it holds the expected file, else downloaded and cached. */
async function storyFormat(path: string, expected: string): Promise<Uint8Array> {
  const cached = join(CACHE, path);
  if (existsSync(cached)) {
    const bytes = new Uint8Array(readFileSync(cached));
    if (sha256(bytes) === expected) return bytes;
  }
  const response = await fetch(ARCHIVE + path, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = sha256(bytes);
  if (hash !== expected) throw new Error(path + ': unexpected SHA-256 ' + hash);
  mkdirSync(dirname(cached), { recursive: true });
  writeFileSync(cached, bytes);
  return bytes;
}

/** Writes `path` when its content changed. */
function update(path: string, data: string | Uint8Array): void {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (existsSync(path) && Buffer.compare(readFileSync(path), bytes) === 0) return;
  writeFileSync(path, bytes);
  console.log('Built ' + path);
}

/** A 16 × 16 grey square with a black frame: the zipped story's picture. */
function picture(): Uint8Array {
  const pixels = new Uint8Array(16 * 16).fill(160);
  for (let i = 0; i < 16; i++) {
    pixels[i] = pixels[15 * 16 + i] = pixels[i * 16] = pixels[i * 16 + 15] = 0;
  }
  return encodeGrayPng(16, 16, pixels);
}

/**
 * The zipped story: lamp-files.twee published with Harlowe in `Lamp/index.html`, which links a stylesheet and a
 * script, next to the files it uses. A fixed date, so the zip only changes with its content.
 */
function filesZip(harlowe: string): Uint8Array {
  const story = parseTwee(readFileSync('tests/fixtures/twine/lamp-files.twee', 'utf8'));
  const page = publish(story, harlowe).replace(
    /<head>/i,
    '<head><link rel="stylesheet" href="css/lamp.css"><script src="js/lamp.js"></script>',
  );
  const text = (value: string) => new TextEncoder().encode(value);
  const mtime = new Date('2026-01-01T00:00:00Z');
  return zipSync(
    {
      'Lamp/index.html': [text(page), { mtime: mtime }],
      'Lamp/css/lamp.css': [
        text('.lamp-styled{letter-spacing:3px;background-image:url(../img/lamp.png)}'),
        { mtime: mtime },
      ],
      'Lamp/js/lamp.js': [
        text("document.documentElement.setAttribute('data-lamp-script', 'ran');"),
        { mtime: mtime },
      ],
      'Lamp/img/lamp.png': [picture(), { mtime: mtime }],
      'Lamp/fonts/lamp.woff2': [
        new Uint8Array(
          readFileSync('node_modules/@fontsource/literata/files/literata-latin-400-normal.woff2'),
        ),
        { mtime: mtime },
      ],
      'Lamp/sound/sea.mp3': [new Uint8Array(64), { mtime: mtime }],
    },
    { level: 6 },
  );
}

try {
  let harlowe = '';
  for (const fixture of FIXTURES) {
    const format = await storyFormat(fixture.format, fixture.sha256);
    const source = formatSource(new TextDecoder().decode(format));
    if (/harlowe/.test(fixture.format)) harlowe = source;
    update(fixture.html, publish(parseTwee(readFileSync(fixture.twee, 'utf8')), source));
  }
  update('tests/fixtures/twine/lamp-files.zip', filesZip(harlowe));
} catch (error) {
  console.error(`Could not build the Twine test fixtures: ${(error as Error).message}`);
  process.exit(1);
}
