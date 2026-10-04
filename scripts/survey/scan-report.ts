// Story-file scan (story S7.4): the report, made of the features of every story file scanned.
import type { Counts, Feature } from './features.ts';

export interface ScanResult {
  tuid: string;
  title: string;
  format: string;
  /** Number of ratings on IFDB (the order games are listed in). */
  ratings: number;
  featured: boolean;
  counts: Counts;
  /** Characters outside the bundled fonts (the libraries' left out). */
  glyphs: number[];
  error?: string;
}

/** What each feature means for the reader, and whether replaying the games that use it is worth it. */
export const FEATURES: Record<Feature, { title: string; meaning: string; replay: boolean }> = {
  'quote-box': {
    title: 'Quote boxes',
    meaning: 'Calls to the box routine (Inform `box`): a quotation in the upper window (S1.23).',
    replay: true,
  },
  'upper-window': {
    title: 'Own drawing in the upper window',
    meaning:
      "The game's own code writes in the upper window (maps, title cards, menus, extra status rows): the top zone shows 4 rows.",
    replay: true,
  },
  'clear-screen': {
    title: 'Own screen clears',
    meaning:
      "The game's own code clears the whole screen (title screens, chapters): a new page since S1.16.",
    replay: false,
  },
  'timed-input': {
    title: 'Timed input (Z-machine)',
    meaning:
      'Key or line input with a time limit: the reader never sends the timer, so real-time events never fire.',
    replay: true,
  },
  timer: {
    title: 'Timer (Glulx)',
    meaning:
      'Timer events requested: the reader never sends them (support: []), so real-time events never fire.',
    replay: true,
  },
  sound: { title: 'Sound', meaning: 'Sounds played: silent in the reader.', replay: false },
  colour: {
    title: 'Colours',
    meaning: 'Text or background colours set: ignored on e-ink.',
    replay: false,
  },
  'char-font': {
    title: 'Character graphics font',
    meaning: 'Z-machine font 3 (Beyond Zork style maps): drawn as letters.',
    replay: true,
  },
  'fixed-font': {
    title: 'Fixed-width font',
    meaning:
      'The game switches to a fixed-width font in its own code (maps, tables, ASCII art): they may wrap.',
    replay: false,
  },
  unicode: {
    title: 'Characters outside the bundled fonts',
    meaning: 'Characters the game can print that Literata and Source Sans 3 (latin) do not have.',
    replay: false,
  },
  'graphics-window': {
    title: 'Graphics windows',
    meaning: 'A graphics window is opened (pictures, maps, status bars drawn): not shown.',
    replay: true,
  },
  'grid-window': {
    title: 'Extra text grid windows',
    meaning: 'A text grid besides the status line: it shares the top zone with the status line.',
    replay: true,
  },
  'buffer-window': {
    title: 'Extra text buffer windows',
    meaning: 'A text buffer besides the main one (side panels): mixed into the main text.',
    replay: true,
  },
  hyperlinks: {
    title: 'Hyperlinks',
    meaning: 'Clickable links: shown as plain text.',
    replay: true,
  },
  images: {
    title: 'Pictures',
    meaning: 'Pictures drawn (Glulx): shown in the text, not in graphics windows.',
    replay: false,
  },
  'version-6': {
    title: 'Z-machine version 6',
    meaning: 'Graphical Z-machine: not played by the app.',
    replay: false,
  },
};

function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

const code = (c: number) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0');

/** The games to replay with the rendering survey: the most-rated ones of each feature worth a replay. */
export function replayList(results: ScanResult[], perFeature = 5): string[] {
  const list: string[] = [];
  for (const feature of Object.keys(FEATURES) as Feature[]) {
    if (!FEATURES[feature].replay) continue;
    const games = results.filter((r) => r.counts[feature]).sort((a, b) => b.ratings - a.ratings);
    for (const g of games.slice(0, perFeature)) if (list.indexOf(g.tuid) < 0) list.push(g.tuid);
  }
  return list;
}

/** The report: features by number of games, the games to replay, then the games and their features. */
export function scanReport(results: ScanResult[], date: string, maxGames = 300): string {
  const scanned = results.filter((r) => !r.error);
  const lines: string[] = [];
  lines.push('# Story-file scan — ' + date);
  lines.push('');
  lines.push(
    'Made by `npm run survey:scan` (story S7.4): ' +
      results.length +
      ' parser games of the published catalogue (' +
      scanned.length +
      ' read, ' +
      scanned.filter((r) => r.format === 'zcode').length +
      ' Z-machine, ' +
      scanned.filter((r) => r.format === 'glulx').length +
      ' Glulx), read from their story files without playing them. Routines and functions found in many games are ' +
      "the libraries' and are left out, except for windows and quote boxes; see the story for the method and its limits.",
  );
  lines.push('');
  lines.push('## Features by number of games');
  lines.push('');
  lines.push('| Feature | Games | What it means | Most-rated games |');
  lines.push('|---|---:|---|---|');
  const features = (Object.keys(FEATURES) as Feature[])
    .map((f) => ({
      f: f,
      games: scanned.filter((r) => r.counts[f]).sort((a, b) => b.ratings - a.ratings),
    }))
    .filter((x) => x.games.length)
    .sort((a, b) => b.games.length - a.games.length);
  for (const { f, games } of features) {
    const names = games.slice(0, 12).map((g) => g.title + (g.featured ? ' ★' : ''));
    lines.push(
      '| ' +
        cell(FEATURES[f].title) +
        ' | ' +
        games.length +
        ' | ' +
        cell(FEATURES[f].meaning) +
        ' | ' +
        cell(names.join(', ') + (games.length > 12 ? '…' : '')) +
        ' |',
    );
  }
  const glyphs: Record<number, number> = {};
  for (const r of scanned) for (const c of r.glyphs) glyphs[c] = (glyphs[c] || 0) + 1;
  const common = Object.keys(glyphs)
    .map(Number)
    .sort((a, b) => glyphs[b] - glyphs[a] || a - b)
    .slice(0, 30);
  if (common.length) {
    lines.push('');
    lines.push(
      'Characters outside the fonts, by number of games: ' +
        common
          .map((c) => String.fromCodePoint(c) + ' ' + code(c) + ' (' + glyphs[c] + ')')
          .join(', ') +
        '.',
    );
  }
  const replay = replayList(scanned);
  lines.push('');
  lines.push('## Games to replay');
  lines.push('');
  lines.push(
    'The 5 most-rated games of each feature worth a look, for the rendering survey (S7.3):',
  );
  lines.push('');
  lines.push('```');
  lines.push('npm run survey:rendering -- --only ' + replay.join(','));
  lines.push('```');
  const failed = results.filter((r) => r.error);
  if (failed.length) {
    lines.push('');
    lines.push('## Not read');
    lines.push('');
    for (const r of failed)
      lines.push('- ' + cell(r.title) + ' (' + r.format + '): ' + cell(r.error!));
  }
  lines.push('');
  lines.push('## Games');
  lines.push('');
  const listed = scanned
    .filter((r) => Object.keys(r.counts).length)
    .sort((a, b) => b.ratings - a.ratings);
  lines.push(
    'The ' +
      Math.min(maxGames, listed.length) +
      ' most-rated games with a feature (of ' +
      listed.length +
      '), with the number of places in their code:',
  );
  lines.push('');
  lines.push('| Game | Format | Features |');
  lines.push('|---|---|---|');
  for (const r of listed.slice(0, maxGames)) {
    const found = (Object.keys(r.counts) as Feature[])
      .map(
        (f) =>
          FEATURES[f].title +
          ' ' +
          r.counts[f] +
          (f === 'unicode'
            ? ' (' +
              r.glyphs
                .map((c) => String.fromCodePoint(c))
                .slice(0, 8)
                .join('') +
              ')'
            : ''),
      )
      .join('; ');
    lines.push(
      '| ' +
        cell(r.title + (r.featured ? ' ★' : '')) +
        ' | ' +
        r.format +
        ' | ' +
        cell(found) +
        ' |',
    );
  }
  lines.push('');
  lines.push('★ featured on Home.');
  lines.push('');
  return lines.join('\n');
}
