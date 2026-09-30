// Rebuilds the Twine test fixtures (tests/fixtures/twine/*.twee → *.html) with their story formats, downloaded from
// the Story Format Archive and checked against the SHA-256 it publishes. The built files are committed, so CI does not
// download anything. Run: node scripts/fixtures/build-twine.ts
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { formatSource, parseTwee, publish } from './twee.ts';

const ARCHIVE =
  'https://raw.githubusercontent.com/videlais/story-formats-archive/refs/heads/docs/official/twine2/';

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

for (const fixture of FIXTURES) {
  const response = await fetch(ARCHIVE + fixture.format, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(fixture.format + ': HTTP ' + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== fixture.sha256) throw new Error(fixture.format + ': unexpected SHA-256 ' + hash);
  const story = parseTwee(readFileSync(fixture.twee, 'utf8'));
  writeFileSync(fixture.html, publish(story, formatSource(new TextDecoder().decode(bytes))));
  console.log('Built ' + fixture.html);
}
