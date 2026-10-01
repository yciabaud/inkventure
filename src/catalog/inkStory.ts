// The compiled story of an ink game (story S2.7). Authors publish the web export of Inky more often than the compiled
// `.json`: an `index.html` with `ink.js`, `main.js` and the story in `story.js` (`var storyContent = {…};`). The
// story is the object assigned to `storyContent`, read as JSON: the export's scripts are never run.

/** `var|let|const storyContent =`, then the object. */
const ASSIGNMENT = /\b(?:var|let|const)\s+storyContent\s*=\s*\{/g;

/** The end (exclusive) of the JSON object that starts at `start` (a `{`), or -1 when it does not end. */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Whether `json` parses to a compiled ink story (it carries `inkVersion`). */
function isInkJson(json: string): boolean {
  try {
    const data = JSON.parse(json) as { inkVersion?: unknown } | null;
    return !!data && typeof data === 'object' && typeof data.inkVersion === 'number';
  } catch {
    return false;
  }
}

/**
 * The compiled story's JSON in a file of an ink game: the file itself when it is the compiled `.json`, else the
 * object assigned to `storyContent` (a web export's `story.js`, or its page when the story is inline). Null when
 * there is none, or it is not a compiled ink story.
 */
export function inkStoryJson(text: string): string | null {
  // inklecate writes a byte order mark.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (/^\s*\{/.test(body)) return isInkJson(body) ? body : null;
  ASSIGNMENT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ASSIGNMENT.exec(body))) {
    const start = match.index + match[0].length - 1;
    const end = objectEnd(body, start);
    if (end < 0) return null;
    const json = body.slice(start, end);
    if (isInkJson(json)) return json;
  }
  return null;
}
