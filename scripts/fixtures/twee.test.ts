import { describe, expect, it } from 'vitest';
import { formatSource, parseTwee, publish } from './twee.ts';

const TWEE = `:: StoryTitle
A <Story>

:: StoryData
{ "ifid": "ID", "format": "Harlowe", "format-version": "3.3.9", "start": "Start" }

:: Script [script]
window.x = 1;

:: Start [intro dark] {"position":"0,0"}
Hello & [[Next]]

:: Next
The end.
`;

describe('twee fixtures', () => {
  it('reads passages, their tags, the title and story data', () => {
    const story = parseTwee(TWEE);
    expect(story.title).toBe('A <Story>');
    expect(story.data.start).toBe('Start');
    expect(story.passages.map((p) => [p.name, p.tags])).toEqual([
      ['Script', ['script']],
      ['Start', ['intro', 'dark']],
      ['Next', []],
    ]);
    expect(story.passages[1].text).toBe('Hello & [[Next]]');
  });

  it('publishes into the story format page', () => {
    const format = `window.storyFormat({"name":"F","source":"<title>{{STORY_NAME}}</title>{{STORY_DATA}}",
      "editorExtensions": { "codeMirror": function () {} }});`;
    const html = publish(parseTwee(TWEE), formatSource(format));
    expect(html).toContain('<title>A &lt;Story&gt;</title>');
    expect(html).toContain('startnode="1"');
    expect(html).toContain('type="text/twine-javascript">window.x = 1;</script>');
    expect(html).toContain(
      '<tw-passagedata pid="1" name="Start" tags="intro dark" position="100,100" size="100,100">' +
        'Hello &amp; [[Next]]</tw-passagedata>',
    );
    expect(html).not.toContain('name="Script"');
  });
});
