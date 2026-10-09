// Release notes (story S7.5): the Markdown body of the GitHub release of a `v*` tag, written by the Ebook workflow
// from what the repository already knows: the stories done since the previous tag (docs/BACKLOG.md), the stories
// still open, the latest device checklist (docs/device-reports/), the published catalogue, the first-load sizes and
// the ebooks. What only the owner can say (highlights, known issues seen on a device) comes from an optional
// hand-written file, docs/releases/<tag>.md.
import type { BooksManifest } from '../../src/ebook-page/page.ts';
import { KIB, type Row } from '../size/budget.ts';

export interface Story {
  id: string;
  title: string;
  /** Path relative to docs/, e.g. stories/S1.1-paginated-text-view.md. */
  file: string;
  epic: string;
  milestone: string;
  status: string;
}

export interface Backlog {
  /** Epic names by id (E1 → Reader & engines). */
  epics: Record<string, string>;
  stories: Story[];
}

/** Reads the Epics and Stories tables of docs/BACKLOG.md. */
export function parseBacklog(md: string): Backlog {
  const epics: Record<string, string> = {};
  const stories: Story[] = [];
  for (const line of md.split('\n')) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const story = /^\[(S\d+\.\d+)\]\(([^)]+)\)$/.exec(cells[0] || '');
    if (story && cells.length >= 6) {
      stories.push({
        id: story[1],
        file: story[2],
        title: cells[1],
        epic: cells[2],
        milestone: cells[3],
        status: cells[5],
      });
    } else if (cells.length === 2 && /^E\d+$/.test(cells[0])) {
      epics[cells[0]] = cells[1];
    }
  }
  return { epics, stories };
}

/** The stories done now that were not done at the previous tag (all of them without one). */
export function newlyDone(current: Backlog, previous: Backlog | null): Story[] {
  const before = new Set(
    previous ? previous.stories.filter((s) => s.status === 'done').map((s) => s.id) : [],
  );
  return current.stories.filter((s) => s.status === 'done' && !before.has(s.id));
}

/** The stories still to do in a milestone of this release (Post-V1 ones wait for a later one). */
export function openStories(backlog: Backlog): Story[] {
  return backlog.stories.filter(
    (s) => ['todo', 'in-progress', 'blocked'].includes(s.status) && s.milestone !== 'Post-V1',
  );
}

/** The Results table of a device checklist report (the first table whose header starts with `Item`), or null. */
export function resultsTable(report: string): string | null {
  const lines = report.split('\n');
  const start = lines.findIndex((l) => /^\|\s*Item\s*\|/.test(l));
  if (start < 0) return null;
  let end = start;
  while (end < lines.length && lines[end].startsWith('|')) end++;
  return lines.slice(start, end).join('\n');
}

export interface ReleaseFile {
  /** Everything but the Known issues section, inserted after the title. */
  intro: string;
  /** The bullets of its `### Known issues` section, listed before the open stories. */
  knownIssues: string[];
}

/** Splits docs/releases/<tag>.md into its intro and its `### Known issues` bullets. */
export function parseReleaseFile(md: string): ReleaseFile {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^###?\s+Known issues\s*$/i.test(l));
  if (start < 0) return { intro: md.trim(), knownIssues: [] };
  let end = start + 1;
  while (end < lines.length && !/^#{1,3}\s/.test(lines[end])) end++;
  const knownIssues: string[] = [];
  for (const line of lines.slice(start + 1, end)) {
    if (/^[-*]\s/.test(line)) knownIssues.push(line.replace(/^[-*]\s+/, ''));
    else if (/^\s+\S/.test(line) && knownIssues.length) {
      knownIssues[knownIssues.length - 1] += ' ' + line.trim();
    }
  }
  const intro = lines.slice(0, start).concat(lines.slice(end)).join('\n').trim();
  return { intro, knownIssues };
}

export interface CatalogMeta {
  count: number;
  built: string;
  facets?: { formats?: [string, number][] };
}

export interface DeviceReport {
  /** Path relative to docs/device-reports/. */
  file: string;
  content: string;
}

export interface NotesInput {
  tag: string;
  /** YYYY-MM-DD. */
  date: string;
  /** The commit the release is built from. */
  commit: string;
  previousTag: string | null;
  /** https://github.com/<owner>/<repo>, for links that work in a release body. */
  repoUrl: string;
  /** The site's address, with a trailing slash (ebook/config.json's host). */
  site: string;
  backlog: Backlog;
  previousBacklog: Backlog | null;
  releaseFile: ReleaseFile | null;
  checklist: DeviceReport | null;
  catalog: CatalogMeta | null;
  /** check:size rows (`--json`); only the first-load ones are used. */
  sizes: Row[] | null;
  books: BooksManifest | null;
}

const FORMAT_NAMES: Record<string, string> = {
  zcode: 'Z-machine',
  glulx: 'Glulx',
  twine: 'Twine',
  ink: 'ink',
};

const LOCALE_NAMES: Record<string, string> = { en: 'English', fr: 'French' };

function thousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fileSize(bytes: number): string {
  return bytes >= KIB * KIB
    ? (bytes / KIB / KIB).toFixed(1) + ' MB'
    : Math.round(bytes / KIB) + ' KB';
}

function storyLink(s: Story, input: NotesInput): string {
  return `[${s.id}](${input.repoUrl}/blob/${input.tag}/docs/${s.file}) ${s.title}`;
}

export function releaseNotes(input: NotesInput): string {
  const out: string[] = [`## Inkventure ${input.tag} — ${input.date}`, ''];
  if (input.releaseFile && input.releaseFile.intro) out.push(input.releaseFile.intro, '');
  out.push(`**Play:** open ${input.site} in your e-reader's web browser.`, '');

  out.push('### Catalogue', '');
  if (input.catalog) {
    const formats = (input.catalog.facets?.formats || [])
      .map(([f, n]) => `${FORMAT_NAMES[f] || f} ${thousands(n)}`)
      .join(', ');
    out.push(
      `${thousands(input.catalog.count)} playable games` +
        (formats ? ` (${formats})` : '') +
        `, catalogue built on ${input.catalog.built.slice(0, 10)}. It is rebuilt from IFDB every week.`,
      '',
    );
  } else {
    out.push('Not available (no published catalogue).', '');
  }

  const done = newlyDone(input.backlog, input.previousBacklog);
  out.push(
    input.previousTag
      ? `### Stories done since ${input.previousTag}`
      : '### Stories in this release',
    '',
  );
  if (!done.length) out.push('None.', '');
  else {
    out.push(
      `<details><summary>${done.length} ${done.length === 1 ? 'story' : 'stories'}</summary>`,
      '',
    );
    const epics = Object.keys(input.backlog.epics);
    for (const epic of epics.concat(
      done.map((s) => s.epic).filter((e, i, all) => !epics.includes(e) && all.indexOf(e) === i),
    )) {
      const inEpic = done.filter((s) => s.epic === epic);
      if (!inEpic.length) continue;
      out.push(`**${input.backlog.epics[epic] || epic}**`, '');
      for (const s of inEpic) out.push(`- ${storyLink(s, input)}`);
      out.push('');
    }
    out.push('</details>', '');
  }

  out.push('### Device results', '');
  if (input.checklist) {
    const table = resultsTable(input.checklist.content);
    const link = `${input.repoUrl}/blob/${input.tag}/docs/device-reports/${input.checklist.file}`;
    out.push(`From the latest device checklist, [${input.checklist.file}](${link}).`, '');
    if (table) out.push(table, '');
  } else {
    out.push('No device checklist recorded.', '');
  }
  out.push(
    'Targets: Home < 3 s, Library < 4 s, page turn < 300 ms, Z-machine turn < 1 s, Glulx turn < 3 s.',
    '',
  );

  out.push('### Sizes', '');
  const firstLoads = (input.sizes || []).filter((r) => r.label.startsWith('First load'));
  if (firstLoads.length) {
    for (const r of firstLoads) {
      out.push(`- ${r.label}: ${(r.bytes / KIB).toFixed(1)} KiB gz of ${r.budget} KiB`);
    }
    out.push('');
  } else {
    out.push('Not measured.', '');
  }

  out.push('### Known issues', '');
  const issues = (input.releaseFile ? input.releaseFile.knownIssues : []).concat(
    openStories(input.backlog).map((s) => `Not done yet: ${storyLink(s, input)}.`),
  );
  if (issues.length) {
    for (const issue of issues) out.push(`- ${issue}`);
    out.push('');
  } else {
    out.push('None known.', '');
  }

  out.push('### Ebooks', '');
  if (input.books && input.books.books.length) {
    out.push('Attached below, and published at ' + input.site + 'ebook/:', '');
    for (const b of input.books.books) {
      out.push(
        `- \`${b.file}\`: ${LOCALE_NAMES[b.locale] || b.locale}, ${b.format.toUpperCase()}, ${fileSize(b.size)}`,
      );
    }
    out.push('', 'EPUB for most e-readers; AZW3 for e-readers that use that format.', '');
  } else {
    out.push('Not built.', '');
  }

  out.push(`_Built from commit \`${input.commit.slice(0, 7)}\`._`);
  return out.join('\n') + '\n';
}
