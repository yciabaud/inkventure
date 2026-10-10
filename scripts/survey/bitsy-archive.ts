// Bitsy spike (story S0.12): how many games of Ragzouken's bitsy-archive (https://github.com/Ragzouken/bitsy-archive,
// game data collected with each author's permission) play from their data alone in the Bitsy probe's runtime (the
// pinned engine with the e-ink system layer), and which features they use.
//
//   git clone --depth 1 https://github.com/Ragzouken/bitsy-archive.git <dir>
//   node scripts/survey/bitsy-archive.ts <dir> [--json out.json]
//
// A game "plays" when it starts, draws, and takes a tap and four moves with no error thrown. The archive has game data
// only, so bitsy-hacks (scripts added to an export) cannot be seen; the dialogue tags that common hacks read, such as
// (exit …) or (image …), are counted instead. Not run in CI (it needs the archive); its output goes in the device
// report.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { KEY, startGame } from '../build/bitsy-headless.ts';

export interface GameSurvey {
  id: string;
  version: string | null;
  rooms: number;
  plays: boolean;
  error?: string;
  /** Tiles or sprites of 16 × 16 pixels: Bitsy HD, a fork. */
  hd: boolean;
  /** More than three colours in a palette (allowed since Bitsy 8; also forks such as Bitsy Color). */
  manyColours: boolean;
  textEffects: boolean;
  transitions: boolean;
  animated: boolean;
  /** Dialogue tags read by bitsy-hacks (the hack itself is not in the data). */
  hackTags: string[];
}

const HACK_TAG =
  /\((exit|exitNow|end|endNow|js|jsNow|eval|image|imageNow|imagePal|paletteSwap|transparent|follow|textEffect|say|noise|dialog)\b/g;

/** What the game data says, without running it. */
export function readFeatures(data: string): Omit<GameSurvey, 'id' | 'plays' | 'error'> {
  const version = /# BITSY VERSION ([\d.]+)/.exec(data)?.[1] ?? null;
  const rooms = (data.match(/^(ROOM|SET) \S+/gm) || []).length;
  const drawing = /^(TIL|SPR|ITM) \S+\n([01]+)$/gm;
  let hd = false;
  for (let m = drawing.exec(data); m; m = drawing.exec(data)) if (m[2].length === 16) hd = true;
  let manyColours = false;
  const palette = /^PAL \S+\n((?:\d+,\d+,\d+\n)+)/gm;
  for (let m = palette.exec(data); m; m = palette.exec(data)) {
    if (m[1].trim().split('\n').length > 3) manyColours = true;
  }
  const tags = new Set<string>();
  for (const m of data.matchAll(HACK_TAG)) tags.add(m[1]);
  return {
    version,
    rooms,
    hd,
    manyColours,
    textEffects: /\{(wvy|shk|rbw|clr\d?)\}/.test(data),
    transitions: /^EXT .* FX /m.test(data),
    animated: /^>$/m.test(data),
    hackTags: [...tags].sort(),
  };
}

/** Starts the game headless, taps, and walks; returns the first error, if any. */
export function tryGame(data: string): string | undefined {
  try {
    const run = startGame(data);
    if (run.errors.length) return run.errors[0];
    if (!run.ik.draws) return 'nothing drawn';
    run.ik.tap();
    run.flush();
    for (const code of [KEY.RIGHT, KEY.DOWN, KEY.LEFT, KEY.UP]) run.press(code);
    if (run.errors.length) return run.errors[0];
    if (run.frames.length) return 'the loop never stops';
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
}

function percent(n: number, total: number) {
  return `${n} (${Math.round((n / total) * 100)} %)`;
}

export function summary(games: GameSurvey[]): string {
  const total = games.length;
  const playing = games.filter((g) => g.plays);
  const clean = playing.filter((g) => !g.hd && !g.hackTags.length);
  const count = (f: (g: GameSurvey) => boolean) => percent(games.filter(f).length, total);
  const versions = new Map<string, number>();
  for (const g of games) {
    const major = g.version ? g.version.split('.')[0] : '?';
    versions.set(major, (versions.get(major) || 0) + 1);
  }
  const errors = new Map<string, number>();
  for (const g of games) if (g.error) errors.set(g.error, (errors.get(g.error) || 0) + 1);
  const lines = [
    `| Games in the archive | ${total} |`,
    `|---|---|`,
    `| Start, draw and take input with no error | ${percent(playing.length, total)} |`,
    `| … and no HD tiles nor hack tags | ${percent(clean.length, total)} |`,
    `| HD (16 × 16) tiles | ${count((g) => g.hd)} |`,
    `| Dialogue tags of bitsy-hacks | ${count((g) => g.hackTags.length > 0)} |`,
    `| More than 3 colours in a palette | ${count((g) => g.manyColours)} |`,
    `| Text effects | ${count((g) => g.textEffects)} |`,
    `| Exit transitions | ${count((g) => g.transitions)} |`,
    `| Animated tiles or sprites | ${count((g) => g.animated)} |`,
    `| One room | ${count((g) => g.rooms <= 1)} |`,
    `| Bitsy versions (major) | ${[...versions.entries()]
      .sort()
      .map(([v, n]) => `${v}: ${n}`)
      .join(', ')} |`,
  ];
  if (errors.size) {
    lines.push('', 'Errors:', '');
    for (const [message, n] of [...errors.entries()].sort((a, b) => b[1] - a[1]))
      lines.push(`- ${n} × ${message}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('bitsy-archive.ts')) {
  const dir = process.argv[2];
  if (!dir) {
    console.error(
      'Usage: node scripts/survey/bitsy-archive.ts <bitsy-archive dir> [--json out.json]',
    );
    process.exit(1);
  }
  const games: GameSurvey[] = [];
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.bitsy.txt'))
    .sort()) {
    const data = readFileSync(join(dir, name), 'utf8');
    const error = tryGame(data);
    games.push({
      id: name.replace('.bitsy.txt', ''),
      ...readFeatures(data),
      plays: !error,
      ...(error ? { error } : {}),
    });
  }
  console.log(summary(games));
  const json = process.argv.indexOf('--json');
  if (json >= 0) writeFileSync(process.argv[json + 1], JSON.stringify(games, null, 2) + '\n');
}
