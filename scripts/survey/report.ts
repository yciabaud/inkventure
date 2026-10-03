// Rendering survey (story S7.3): the report, a Markdown page made of the results of every game played.
import type { Finding, FindingKind } from './detect';

export interface GameResult {
  tuid: string;
  title: string;
  format: string;
  /** Featured on Home, or among the most-rated games. */
  featured: boolean;
  findings: Finding[];
  turns: number;
}

/** What each kind of finding means for a player, and the reader's behaviour today. */
export const KINDS: Record<FindingKind, { title: string; meaning: string }> = {
  'tall-upper': {
    title: 'Tall upper window not shown in full',
    meaning:
      'More than 4 rows in the upper window, outside the menus S1.22 shows in the text area: the top zone shows 3 rows and "…" (the others are in the ⋯ menu).',
  },
  'upper-screen': {
    title: 'Menu drawn in the upper window',
    meaning: 'Shown in the text area since S1.22 (informative: check it reads well).',
  },
  'grid-styles': {
    title: 'Styles in the upper window',
    meaning:
      'Rows of the upper window in different styles (a selection or a title in bold or reverse video): the reader shows them all alike.',
  },
  windows: {
    title: 'Several windows of a kind',
    meaning:
      'Grid windows share the one status zone; buffer windows (side panels) are mixed into the main text.',
  },
  graphics: {
    title: 'Graphics window',
    meaning: 'Not shown: only pictures in the text are.',
  },
  timer: {
    title: 'Timer',
    meaning: 'The game asked for timer events, which the reader never sends (support: []).',
  },
  hyperlinks: {
    title: 'Hyperlinks',
    meaning: 'Links shown as plain text; the reader does not declare hyperlink support.',
  },
  glyphs: {
    title: 'Characters outside the bundled fonts',
    meaning: 'Drawn in a fallback font, or missing on an e-reader without one.',
  },
  'wide-fixed': {
    title: 'Wide fixed-width text',
    meaning:
      'Fixed-width lines laid out in columns (maps, tables, menus) longer than about 40 characters wrap on a 600 px screen.',
  },
  'no-output': {
    title: 'Command answered with nothing',
    meaning: 'A command of the script printed nothing (not always a problem: check).',
  },
  error: { title: 'Engine error', meaning: 'The game stopped on an error.' },
  timeout: { title: 'Hang', meaning: 'No prompt within the time limit.' },
  load: { title: 'Not played', meaning: 'The story file could not be downloaded or opened.' },
};

/** Kinds that are informative, not problems: left out of the ranking. */
const INFO: FindingKind[] = ['upper-screen'];

function cell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** The report: a summary ranked by number of games, then a table of games and their findings. */
export function report(results: GameResult[], date: string, script: string): string {
  const lines: string[] = [];
  const played = results.filter((r) => !r.findings.some((f) => f.kind === 'load'));
  lines.push('# Rendering survey — ' + date);
  lines.push('');
  lines.push(
    'Made by `npm run survey:rendering` (story S7.3): ' +
      results.length +
      ' parser games (' +
      played.length +
      ' played) of the published catalogue, featured first, then the most-rated, played headless with the app’s engines and GlkOte bridge. Script: ' +
      script +
      '.',
  );
  lines.push('');
  lines.push('## Findings by number of games');
  lines.push('');
  lines.push('| Finding | Games | What it means | Games (first step) |');
  lines.push('|---|---:|---|---|');
  const kinds = Object.keys(KINDS) as FindingKind[];
  const counted = kinds
    .map((kind) => ({
      kind: kind,
      games: results.filter((r) => r.findings.some((f) => f.kind === kind)),
    }))
    .filter((k) => k.games.length)
    .sort((a, b) => {
      const info = Number(INFO.indexOf(a.kind) >= 0) - Number(INFO.indexOf(b.kind) >= 0);
      return info || b.games.length - a.games.length;
    });
  for (const { kind, games } of counted) {
    const names = games.map((g) => {
      const f = g.findings.filter((x) => x.kind === kind)[0];
      return g.title + ' (' + f.step + ')';
    });
    lines.push(
      '| ' +
        cell(KINDS[kind].title) +
        ' | ' +
        games.length +
        ' | ' +
        cell(KINDS[kind].meaning) +
        ' | ' +
        cell(names.join(', ')) +
        ' |',
    );
  }
  if (!counted.length) lines.push('| (none) | 0 | | |');
  lines.push('');
  lines.push('## Games');
  lines.push('');
  lines.push('| Game | Format | Turns | Findings |');
  lines.push('|---|---|---:|---|');
  for (const r of results) {
    const found = r.findings.length
      ? r.findings
          .map((f) => '**' + KINDS[f.kind].title + '** (' + f.step + '): ' + f.detail)
          .join('; ')
      : '—';
    lines.push(
      '| ' +
        cell(r.title + (r.featured ? ' ★' : '')) +
        ' | ' +
        r.format +
        ' | ' +
        r.turns +
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
