// Markdown summary of a resolution, with the distribution of the raw IFDB fields it relies on (link formats,
// compression, languages, genres), so a live run can be checked from the GitHub Actions job summary.
import type { RawDataset } from './crawler.ts';
import type { Resolution } from './resolver.ts';

function tally(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

function table(title: string, rows: Array<[string, number]>, max = 15): string {
  if (!rows.length) return `**${title}**: none\n`;
  const shown = rows.slice(0, max).map(([value, count]) => `| \`${value}\` | ${count} |`);
  const more = rows.length > max ? `\n\n…and ${rows.length - max} more.` : '';
  return `**${title}**\n\n| Value | Games |\n|---|---|\n${shown.join('\n')}${more}\n`;
}

function languages(resolution: Resolution): string {
  const { changed, versions, assumed, unknownOverrides } = resolution.languages;
  // Markdown table cell: backslashes first, then the pipes.
  const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const parts = [
    changed.length
      ? "**Language not IFDB's first (S2.6)**\n\n| Game | Title | IFDB first → kept | From | Why |\n|---|---|---|---|---|\n" +
        changed
          .map(
            (change) =>
              `| \`${change.tuid}\` | ${cell(change.title)} | ${change.from || '(none)'} → ${change.to} | ` +
              `${change.source} | ${cell(change.detail)}${change.file ? ' (file changed)' : ''} |`,
          )
          .join('\n') +
        '\n'
      : "**Language not IFDB's first (S2.6)**: none\n",
    versions.length
      ? '**Games with a file per language (S2.6)**\n\n| Game | Title | Languages |\n|---|---|---|\n' +
        versions
          .map(
            (game) => `| \`${game.tuid}\` | ${cell(game.title)} | ${game.languages.join(', ')} |`,
          )
          .join('\n') +
        '\n'
      : '**Games with a file per language (S2.6)**: none\n',
    `${assumed} kept game(s) in several languages play a file whose language IFDB does not say (assumed; to review by hand).\n`,
  ];
  if (unknownOverrides.length) {
    parts.push(
      `Language overrides naming no kept game: ${unknownOverrides.map((t) => '`' + t + '`').join(', ')}.\n`,
    );
  }
  return parts.join('\n');
}

export function summarize(dataset: RawDataset, resolution: Resolution): string {
  const links = dataset.games.flatMap((game) => {
    const downloads = game.record.ifdb.downloads;
    return (downloads && downloads.links) || [];
  }) as Array<{ format?: string; isGame?: boolean; compression?: string }>;
  const field = (name: string) =>
    dataset.games.map((game) => {
      const value = (game.record.bibliographic || {})[name];
      return typeof value === 'string' ? value : '(none)';
    });

  const parts = [
    '### Playability',
    '',
    `${dataset.games.length} games crawled, **${resolution.counts.kept} kept** ` +
      `(policy \`${resolution.policy}\`, formats ${resolution.enabledFormats.map((f) => '`' + f + '`').join(', ')}).`,
    '',
    `**Illustrated**: ${resolution.counts.pictures.illustrated} game(s), of ${resolution.counts.pictures.blorbs} ` +
      `kept Blorb(s) that could hold pictures (${resolution.counts.pictures.inspected} with a known count).`,
    '',
    table(
      'Dropped, by reason',
      Object.entries(resolution.counts.dropped) as Array<[string, number]>,
    ),
    table(
      'Playable file found, by story format (enabled or not)',
      Object.entries(resolution.counts.formats),
    ),
    table(
      'Kept games, by language',
      tally(resolution.games.map((game) => game.language || '(none)')),
    ),
    languages(resolution),
    '### Raw IFDB fields',
    '',
    table(
      'Game links, by IFDB format',
      tally(links.filter((link) => link.isGame).map((link) => link.format || '(none)')),
    ),
    table('Links, by compression', tally(links.map((link) => link.compression || '(none)'))),
    table('`bibliographic.language`', tally(field('language'))),
    table('`bibliographic.genre`', tally(field('genre'))),
  ];
  return parts.join('\n');
}
