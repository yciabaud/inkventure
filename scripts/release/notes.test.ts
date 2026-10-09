import { describe, expect, it } from 'vitest';
import {
  newlyDone,
  openStories,
  parseBacklog,
  parseReleaseFile,
  releaseNotes,
  resultsTable,
  type NotesInput,
} from './notes';

const BACKLOG = `# Backlog

| Epic | Name |
|---|---|
| E0 | Foundations |
| E1 | Reader & engines |

| ID | Title | Epic | Milestone | Depends on | Status |
|---|---|---|---|---|---|
| [S0.1](stories/S0.1-scaffold.md) | Project scaffold | E0 | M0 | — | done |
| [S1.1](stories/S1.1-pages.md) | Paginated text view | E1 | M1 | S0.1 | done |
| [S1.2](stories/S1.2-timers.md) | Timer events | E1 | M6 | S1.1 | todo |
| [S1.3](stories/S1.3-compass.md) | Tappable compass | E1 | Post-V1 | S1.1 | todo |
| [S1.4](stories/S1.4-export.md) | Export | E1 | M3 | S1.1 | dropped |
`;

const PREVIOUS = BACKLOG.replace('| M1 | S0.1 | done |', '| M1 | S0.1 | in-progress |');

const CHECKLIST = `# Device checklist — Kindle

Run by the owner.

| Item | Target | Measured | Pass |
|---|---|---|---|
| Home ready, cold start | < 3 000 ms | 1 918 ms | yes |

The end.
`;

function input(overrides: Partial<NotesInput> = {}): NotesInput {
  return {
    tag: 'v1.0.0',
    date: '2026-10-10',
    commit: 'abcdef1234567',
    previousTag: null,
    repoUrl: 'https://github.com/o/r',
    site: 'https://o.github.io/r/',
    backlog: parseBacklog(BACKLOG),
    previousBacklog: null,
    releaseFile: null,
    checklist: { file: '2026-10-01-kindle-checklist.md', content: CHECKLIST },
    catalog: {
      count: 3002,
      built: '2026-10-09T21:41:58.523Z',
      facets: {
        formats: [
          ['zcode', 1441],
          ['ink', 53],
        ],
      },
    },
    sizes: [
      {
        label: 'CSS',
        files: [],
        bytes: 5000,
        measure: 'gzip',
        budget: 20,
        ok: true,
      },
      {
        label: 'First load (Kindle: modern JS + CSS + .woff2)',
        files: [],
        bytes: 125235,
        measure: 'gzip',
        budget: 200,
        ok: true,
      },
    ],
    books: {
      built: '2026-10-10T00:00:00Z',
      commit: 'abcdef1',
      books: [
        {
          locale: 'en',
          format: 'epub',
          file: 'inkventure-en.epub',
          size: 2516582,
          built: '',
          commit: '',
        },
        {
          locale: 'fr',
          format: 'azw3',
          file: 'inkventure-fr.azw3',
          size: 512000,
          built: '',
          commit: '',
        },
      ],
    },
    ...overrides,
  };
}

describe('backlog', () => {
  it('reads the epics and the stories', () => {
    const backlog = parseBacklog(BACKLOG);
    expect(backlog.epics).toEqual({ E0: 'Foundations', E1: 'Reader & engines' });
    expect(backlog.stories).toHaveLength(5);
    expect(backlog.stories[1]).toEqual({
      id: 'S1.1',
      title: 'Paginated text view',
      file: 'stories/S1.1-pages.md',
      epic: 'E1',
      milestone: 'M1',
      status: 'done',
    });
  });

  it('lists the stories done since the previous tag, or all of them without one', () => {
    const now = parseBacklog(BACKLOG);
    expect(newlyDone(now, null).map((s) => s.id)).toEqual(['S0.1', 'S1.1']);
    expect(newlyDone(now, parseBacklog(PREVIOUS)).map((s) => s.id)).toEqual(['S1.1']);
  });

  it('lists the open stories, leaving out Post-V1 and dropped ones', () => {
    expect(openStories(parseBacklog(BACKLOG)).map((s) => s.id)).toEqual(['S1.2']);
  });
});

describe('device checklist', () => {
  it('takes the Results table', () => {
    expect(resultsTable(CHECKLIST)).toBe(
      '| Item | Target | Measured | Pass |\n|---|---|---|---|\n| Home ready, cold start | < 3 000 ms | 1 918 ms | yes |',
    );
    expect(resultsTable('# No table\n')).toBeNull();
  });
});

describe('release file', () => {
  it('splits the intro from the known issues', () => {
    const file = parseReleaseFile(
      'Intro.\n\n- A highlight.\n\n### Known issues\n\n- First issue,\n  on two lines.\n- Second.\n\n## After\n\nMore.\n',
    );
    expect(file.knownIssues).toEqual(['First issue, on two lines.', 'Second.']);
    expect(file.intro).toBe('Intro.\n\n- A highlight.\n\n## After\n\nMore.');
  });

  it('keeps a file without known issues whole', () => {
    expect(parseReleaseFile('Intro.\n')).toEqual({ intro: 'Intro.', knownIssues: [] });
  });
});

describe('release notes', () => {
  it('gives the catalogue, the stories, the device results, the sizes, the issues and the ebooks', () => {
    const notes = releaseNotes(
      input({
        releaseFile: { intro: 'The first release.', knownIssues: ['Twine is experimental.'] },
      }),
    );
    expect(notes).toMatch(/^## Inkventure v1\.0\.0 — 2026-10-10\n\nThe first release\.\n/);
    expect(notes).toContain('**Play:** open https://o.github.io/r/ in');
    expect(notes).toContain(
      '3,002 playable games (Z-machine 1,441, ink 53), catalogue built on 2026-10-09.',
    );
    expect(notes).toContain('### Stories in this release');
    expect(notes).toContain('<details><summary>2 stories</summary>');
    expect(notes).toContain(
      '**Reader & engines**\n\n- [S1.1](https://github.com/o/r/blob/v1.0.0/docs/stories/S1.1-pages.md) Paginated text view',
    );
    expect(notes).toContain(
      '[2026-10-01-kindle-checklist.md](https://github.com/o/r/blob/v1.0.0/docs/device-reports/2026-10-01-kindle-checklist.md)',
    );
    expect(notes).toContain('| Home ready, cold start | < 3 000 ms | 1 918 ms | yes |');
    expect(notes).toContain(
      '- First load (Kindle: modern JS + CSS + .woff2): 122.3 KiB gz of 200 KiB',
    );
    expect(notes).not.toContain('- CSS');
    expect(notes).toContain(
      '### Known issues\n\n- Twine is experimental.\n- Not done yet: [S1.2](https://github.com/o/r/blob/v1.0.0/docs/stories/S1.2-timers.md) Timer events.',
    );
    expect(notes).not.toContain('S1.3');
    expect(notes).toContain('- `inkventure-en.epub`: English, EPUB, 2.4 MB');
    expect(notes).toContain('- `inkventure-fr.azw3`: French, AZW3, 500 KB');
    expect(notes).toMatch(/_Built from commit `abcdef1`\._\n$/);
  });

  it('names the previous tag', () => {
    const notes = releaseNotes(
      input({ previousTag: 'v0.9.0', previousBacklog: parseBacklog(PREVIOUS) }),
    );
    expect(notes).toContain('### Stories done since v0.9.0');
    expect(notes).toContain('<details><summary>1 story</summary>');
  });

  it('says what is missing', () => {
    const notes = releaseNotes(input({ catalog: null, checklist: null, sizes: null, books: null }));
    expect(notes).toContain('Not available (no published catalogue).');
    expect(notes).toContain('No device checklist recorded.');
    expect(notes).toContain('### Sizes\n\nNot measured.');
    expect(notes).toContain('### Ebooks\n\nNot built.');
  });
});
