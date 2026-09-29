// Checks built asset sizes against size-budget.json (SPEC §10). Run after `vite build`: `npm run check:size`.
// Prints a Markdown table (also appended to the GitHub Actions job summary) and exits 1 when a budget is exceeded.
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { evaluate, toMarkdown, type Budgets, type Manifest, type Sizes } from './budget.ts';

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
const table = toMarkdown(rows);
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Asset size budgets\n\n' + table + '\n');
}

const over = rows.filter((r) => !r.ok);
if (over.length) {
  console.error('\nOver budget: ' + over.map((r) => r.label).join(', '));
  process.exit(1);
}
