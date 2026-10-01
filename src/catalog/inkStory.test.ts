import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inkStoryJson } from './inkStory';

const JSON_TEXT = readFileSync('tests/fixtures/ink/lamp.json', 'utf8').replace(/^\uFEFF/, '');

describe('inkStoryJson', () => {
  it('takes a compiled .json as it is, with or without a byte order mark', () => {
    expect(inkStoryJson(JSON_TEXT)).toBe(JSON_TEXT);
    expect(inkStoryJson('\uFEFF' + JSON_TEXT)).toBe(JSON_TEXT);
  });

  it("reads the object assigned to storyContent in a web export's story.js", () => {
    for (const keyword of ['var', 'let', 'const']) {
      expect(inkStoryJson(keyword + ' storyContent = ' + JSON_TEXT + ';')).toBe(JSON_TEXT);
      expect(inkStoryJson(keyword + ' storyContent=' + JSON_TEXT)).toBe(JSON_TEXT);
      expect(inkStoryJson(keyword + ' storyContent = ' + JSON_TEXT + ';\n// end\n')).toBe(
        JSON_TEXT,
      );
    }
  });

  it('reads a story inline in the page, without running anything', () => {
    const page =
      '<!DOCTYPE html><html><head><script src="ink.js"></script></head><body><div id="story"></div>' +
      '<script>\nvar storyContent = ' +
      JSON_TEXT +
      ';\nwindow.ran = true;\n</script><script src="main.js"></script></body></html>';
    expect(inkStoryJson(page)).toBe(JSON_TEXT);
  });

  it('keeps braces and quotes inside the strings of the story', () => {
    const json = '{"inkVersion":21,"root":["^Say \\"}{\\" ]]",["done",null]],"listDefs":{}}';
    expect(inkStoryJson('var storyContent = ' + json + ';')).toBe(json);
  });

  it('is null without a compiled story, or with a broken one', () => {
    expect(inkStoryJson('')).toBeNull();
    expect(inkStoryJson('<html><body>Play on itch.io</body></html>')).toBeNull();
    expect(inkStoryJson('var other = {"inkVersion":21};')).toBeNull();
    expect(inkStoryJson('var storyContent = {"inkVersion":21,"root":[')).toBeNull();
    expect(inkStoryJson('var storyContent = {inkVersion: 21};')).toBeNull();
    expect(inkStoryJson('var storyContent = {"title":"not ink"};')).toBeNull();
    expect(inkStoryJson('{"title":"not ink"}')).toBeNull();
    expect(inkStoryJson('{ broken')).toBeNull();
  });
});
