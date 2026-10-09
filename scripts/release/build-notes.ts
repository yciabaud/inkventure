// Writes the release notes of a `v*` tag (story S7.5; scripts/release/notes.ts): `npm run release:notes -- --tag
// v1.0.0`. Run after `scripts/catalog/use-published.sh`, `npm run build` and `npm run check:size -- --json <file>`;
// each input that is missing gives a section that says so, so it also previews the notes locally.
//   --tag <v…>         the release's tag (required)
//   --out <file>       where to write them (default: standard output)
//   --catalog <file>   catalogue meta.json (default public/catalog/meta.json)
//   --sizes <file>     check:size --json output
//   --books <file>     the ebook build's books.json (default ebook/build/books.json)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseBacklog, parseReleaseFile, releaseNotes, type DeviceReport } from './notes.ts';

const { values } = parseArgs({
  options: {
    tag: { type: 'string' },
    out: { type: 'string' },
    catalog: { type: 'string', default: 'public/catalog/meta.json' },
    sizes: { type: 'string' },
    books: { type: 'string', default: 'ebook/build/books.json' },
  },
});
if (!values.tag) throw new Error('--tag is required');
const tag = values.tag;

function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return null;
  }
}

function readJson<T>(file: string | undefined): T | null {
  return file && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

// The tag before this one; locally, before the tag exists, the latest tag.
const previousTag =
  (
    git('describe', '--tags', '--abbrev=0', '--match', 'v*', tag + '^') ||
    git('describe', '--tags', '--abbrev=0', '--match', 'v*', 'HEAD')
  )?.trim() || null;
const previousBacklog = previousTag ? git('show', previousTag + ':docs/BACKLOG.md') : null;

const reports = 'docs/device-reports';
const latestChecklist = readdirSync(reports)
  .filter((f) => /-checklist\.md$/.test(f))
  .sort()
  .pop();
const checklist: DeviceReport | null = latestChecklist
  ? { file: latestChecklist, content: readFileSync(reports + '/' + latestChecklist, 'utf8') }
  : null;

const releaseFile = 'docs/releases/' + tag + '.md';
const repo = process.env.GITHUB_REPOSITORY || 'yciabaud/inkventure';

const notes = releaseNotes({
  tag,
  // The day the tag was made, so a re-run keeps it; today before the tag exists (a preview).
  date:
    git('for-each-ref', '--format=%(creatordate:short)', 'refs/tags/' + tag)?.trim() ||
    new Date().toISOString().slice(0, 10),
  commit: process.env.GITHUB_SHA || git('rev-parse', 'HEAD')?.trim() || 'unknown',
  previousTag: previousTag === tag ? null : previousTag,
  repoUrl: (process.env.GITHUB_SERVER_URL || 'https://github.com') + '/' + repo,
  site: (readJson<{ host: string }>('ebook/config.json') as { host: string }).host,
  backlog: parseBacklog(readFileSync('docs/BACKLOG.md', 'utf8')),
  previousBacklog: previousBacklog && previousTag !== tag ? parseBacklog(previousBacklog) : null,
  releaseFile: existsSync(releaseFile) ? parseReleaseFile(readFileSync(releaseFile, 'utf8')) : null,
  checklist,
  catalog: readJson(values.catalog),
  sizes: readJson(values.sizes),
  books: readJson(values.books),
});

if (values.out) writeFileSync(values.out, notes);
else process.stdout.write(notes);
