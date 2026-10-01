// A small Twee 3 reader and Twine 2 publisher, enough for the Twine test fixtures (scripts/fixtures/build-twine.ts):
// passages `:: Name [tags] {metadata}`, StoryTitle, StoryData, and `script` / `stylesheet` passages.
import { runInNewContext } from 'node:vm';

export interface Passage {
  name: string;
  tags: string[];
  text: string;
}

export interface TweeStory {
  title: string;
  data: { ifid: string; format: string; 'format-version': string; start: string };
  passages: Passage[];
}

const HEADER = /^::\s*((?:\\.|[^[{\\])+?)\s*(?:\[([^\]]*)\])?\s*(?:\{.*\})?\s*$/;

export function parseTwee(source: string): TweeStory {
  const passages: Passage[] = [];
  let current: { name: string; tags: string[]; lines: string[] } | null = null;
  const close = () => {
    if (current)
      passages.push({
        name: current.name,
        tags: current.tags,
        text: current.lines.join('\n').replace(/\s+$/, ''),
      });
  };
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const header = line.startsWith('::') ? HEADER.exec(line) : null;
    if (header) {
      close();
      const tags = header[2] ? header[2].split(/\s+/).filter(Boolean) : [];
      current = { name: header[1].replace(/\\(.)/g, '$1'), tags: tags, lines: [] };
    } else if (current) current.lines.push(line);
  }
  close();
  const title = passages.find((p) => p.name === 'StoryTitle');
  const data = passages.find((p) => p.name === 'StoryData');
  if (!title || !data) throw new Error('StoryTitle and StoryData passages are required');
  return {
    title: title.text.trim(),
    data: JSON.parse(data.text) as TweeStory['data'],
    passages: passages.filter((p) => p !== title && p !== data),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The `<tw-storydata>` element of a published Twine 2 story. */
export function storyData(story: TweeStory): string {
  const special = (tag: string) =>
    story.passages
      .filter((p) => p.tags.includes(tag))
      .map((p) => p.text)
      .join('\n');
  const passages = story.passages.filter(
    (p) => !p.tags.includes('script') && !p.tags.includes('stylesheet'),
  );
  const start = passages.findIndex((p) => p.name === story.data.start);
  if (start < 0) throw new Error('No start passage ' + story.data.start);
  return (
    '<tw-storydata name="' +
    escapeHtml(story.title) +
    '" startnode="' +
    (start + 1) +
    '" creator="Inkventure fixtures" creator-version="1" ifid="' +
    escapeHtml(story.data.ifid) +
    '" zoom="1" format="' +
    escapeHtml(story.data.format) +
    '" format-version="' +
    escapeHtml(story.data['format-version']) +
    '" options="" hidden>' +
    '<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css">' +
    special('stylesheet') +
    '</style>' +
    '<script role="script" id="twine-user-script" type="text/twine-javascript">' +
    special('script') +
    '</script>' +
    passages
      .map(
        (p, i) =>
          '<tw-passagedata pid="' +
          (i + 1) +
          '" name="' +
          escapeHtml(p.name) +
          '" tags="' +
          escapeHtml(p.tags.join(' ')) +
          '" position="' +
          (100 + 150 * i) +
          ',100" size="100,100">' +
          escapeHtml(p.text) +
          '</tw-passagedata>',
      )
      .join('') +
    '</tw-storydata>'
  );
}

/** The published story: the story format's page with the story's name and data filled in. */
export function publish(story: TweeStory, formatSource: string): string {
  return formatSource
    .split('{{STORY_NAME}}')
    .join(escapeHtml(story.title))
    .split('{{STORY_DATA}}')
    .join(storyData(story));
}

/**
 * The `source` (page template) of a story format file, `window.storyFormat({...})`: a JavaScript object (Harlowe's has
 * functions), so the file is run in an empty context. Only for checked files: it runs their code.
 */
export function formatSource(formatJs: string): string {
  let format: { source?: unknown } | undefined;
  runInNewContext(formatJs, {
    window: { storyFormat: (value: { source?: unknown }) => (format = value) },
  });
  if (!format || typeof format.source !== 'string')
    throw new Error('Not a story format file with a source');
  return format.source;
}
