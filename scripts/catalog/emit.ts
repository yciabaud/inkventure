// Catalogue emitter CLI (SPEC §5.2 steps 4–5; story S2.3): writes the files the app loads from the resolved games,
// after validating them. Exits 1 when the catalogue is invalid (schema, shard size, > 20 % drop).
//
//   node scripts/catalog/emit.ts [--in FILE] [--out DIR] [--previous META] [--built ISO] [--summary FILE]
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { emit, validate, type Meta } from './emitter.ts';
import { writeCatalog } from './files.ts';
import type { ResolvedGame } from './resolver.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/resolved/games.json' },
    report: { type: 'string', default: 'data/resolved/report.json' },
    out: { type: 'string', default: 'data/catalog' },
    // meta.json of the catalogue currently published, for the drop check.
    previous: { type: 'string' },
    built: { type: 'string' },
    summary: { type: 'string' },
  },
});

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const games = readJson<{ games: ResolvedGame[] }>(values.in).games;
const policy = existsSync(values.report)
  ? readJson<{ policy: string }>(values.report).policy
  : process.env.CONTENT_POLICY || 'general';
const budgets = readJson<{ catalogShard: number }>('size-budget.json');
const previous =
  values.previous && existsSync(values.previous) ? readJson<Meta>(values.previous) : undefined;

const files = emit(games, { built: values.built || new Date().toISOString(), policy: policy });
const { errors, sizes } = validate(files, {
  shardBudgetBytes: budgets.catalogShard * 1024,
  previousCount: previous ? previous.count : undefined,
});

const meta = files['meta.json'] as Meta;
const largestDetail = Object.keys(sizes)
  .filter((path) => path.indexOf('games/') === 0)
  .reduce((max, path) => Math.max(max, sizes[path]), 0);
const lines = [
  '### Catalogue',
  '',
  `${meta.count} games in ${meta.shards.length} shard(s)` +
    (previous ? ` (previous build: ${previous.count})` : '') +
    `; ${meta.illustrated} illustrated; largest game detail ${largestDetail} bytes.`,
  '',
  '| Shard | Bytes |',
  '|---|---|',
  ...meta.shards.map((shard) => `| ${shard} | ${sizes[shard]} |`),
  '',
  errors.length
    ? `**${errors.length} error(s)**:\n\n` +
      errors
        .slice(0, 50)
        .map((e) => '- ' + e)
        .join('\n')
    : 'Valid.',
];
const summary = lines.join('\n');
console.log(summary);
if (values.summary) appendFileSync(values.summary, summary + '\n');

if (errors.length) process.exit(1);
writeCatalog(values.out, files);
