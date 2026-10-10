// Checks built asset sizes against size-budget.json (SPEC §10). Run after `vite build`: `npm run check:size`.
// Prints a Markdown table (also appended to the GitHub Actions job summary) and exits 1 when a budget is exceeded.
// `--json <file>` also writes the rows, for the release notes (scripts/release/).
import { appendFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { evaluate, KIB, toMarkdown, type Budgets, type Manifest, type Sizes } from './budget.ts';

const dist = 'dist';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else out.push(relative(dist, path).split(sep).join('/'));
  }
  return out;
}

const manifest = JSON.parse(readFileSync(join(dist, '.vite', 'manifest.json'), 'utf8')) as Manifest;
const budgets = JSON.parse(readFileSync('size-budget.json', 'utf8')) as Budgets;
const files = listFiles(dist).filter((f) => !f.startsWith('.vite/'));

const sizes: Sizes = {};
for (const file of files) {
  const data = readFileSync(join(dist, file));
  sizes[file] = { raw: data.length, gzip: gzipSync(data, { level: 9 }).length };
}

const rows = evaluate(manifest, files, sizes, budgets);
let table = toMarkdown(rows);
// Reported, not budgeted: the Decker probe's runtime (S0.11), a spike page outside the app.
const decker = sizes['probe/decker/runtime.js'];
if (decker) {
  table +=
    `\n\nNot budgeted: the Decker probe runtime (S0.11), probe/decker/runtime.js, ` +
    `${(decker.gzip / KIB).toFixed(1)} KiB gzip (${(decker.raw / KIB).toFixed(1)} KiB raw).`;
}
const json = process.argv.indexOf('--json');
if (json >= 0) writeFileSync(process.argv[json + 1], JSON.stringify(rows, null, 2) + '\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Asset size budgets\n\n' + table + '\n');
}

const over = rows.filter((r) => !r.ok);
if (over.length) {
  console.error('\nOver budget: ' + over.map((r) => r.label).join(', '));
  process.exit(1);
}
