// Featured selection CLI (SPEC §5.3; story S2.4): checks content/featured.json against a catalogue and writes the
// catalogue's featured.json (curated games, then the best-rated ones, per UI locale).
//
//   node scripts/catalog/build-featured.ts [--content FILE] [--catalog DIR] [--out FILE] [--check [--schema-only]]
//                                          [--summary FILE]
//
// --check (CI): exits 1 on any problem, including a curated game the catalogue cannot feature; writes nothing.
// Otherwise (deployment builds): exits 1 only when the curated file itself is invalid; curated games the catalogue
// cannot feature are left out with a warning, so a game withdrawn from IFDB does not block a deployment.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { serialize, type IndexRow, type Meta } from './emitter.ts';
import {
  buildFeatured,
  curatedProblems,
  featuredProblems,
  type CatalogView,
  type CuratedFile,
} from './featured.ts';
import { uiLocales } from './locales.ts';
import type { ContentPolicyConfig } from './resolver.ts';

const { values } = parseArgs({
  options: {
    content: { type: 'string', default: 'content/featured.json' },
    catalog: { type: 'string', default: 'public/catalog' },
    out: { type: 'string' },
    check: { type: 'boolean', default: false },
    // With --check: the curated file alone, when no published catalogue is at hand.
    'schema-only': { type: 'boolean', default: false },
    summary: { type: 'string' },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const locales = uiLocales();
const content = readJson<unknown>(values.content);
const policy = readJson<ContentPolicyConfig>('scripts/catalog/content-policy.json');
const meta = readJson<Meta>(join(values.catalog, 'meta.json'));
let rows: IndexRow[] = [];
for (const shard of meta.shards) {
  rows = rows.concat(readJson<{ rows: IndexRow[] }>(join(values.catalog, shard)).rows);
}
const catalog: CatalogView = {
  policy: meta.policy,
  rows: rows,
  tags: (tuid) => {
    const path = join(values.catalog, 'games', tuid + '.json');
    return existsSync(path) ? readJson<{ tags?: string[] }>(path).tags || [] : undefined;
  },
};

function report(title: string, problems: string[]): void {
  const text = [
    '### ' + title,
    '',
    problems.length ? problems.map((p) => '- ' + p).join('\n') : 'Valid.',
  ].join('\n');
  console.log(text);
  if (values.summary) appendFileSync(values.summary, text + '\n');
}

if (values.check) {
  const problems = values['schema-only']
    ? curatedProblems(content, locales)
    : featuredProblems(content, catalog, policy, locales);
  report(
    values['schema-only']
      ? 'Featured selection (curated file only)'
      : `Featured selection (${meta.count} games catalogue, built ${meta.built})`,
    problems,
  );
  if (problems.length) process.exit(1);
} else {
  const problems = curatedProblems(content, locales);
  if (problems.length) {
    report('Featured selection', problems);
    process.exit(1);
  }
  const { file, skipped } = buildFeatured(
    content as CuratedFile,
    catalog,
    policy,
    locales,
    meta.built,
  );
  for (const line of skipped) console.warn('Warning: curated game left out, ' + line);
  const out = values.out || join(values.catalog, 'featured.json');
  writeFileSync(out, serialize(file) + '\n');
  console.log(
    'Featured lists written to ' +
      out +
      ': ' +
      locales.map((l) => l + ' ' + file.locales[l].length).join(', ') +
      ' games.',
  );
}
