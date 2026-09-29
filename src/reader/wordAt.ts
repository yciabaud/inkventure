// The word under a tap in the story text, for "tap a word to put it in the command field" (SPEC §3.6).

const WORD_CHAR = /[A-Za-zÀ-ÖØ-öø-ÿ0-9'’-]/;

interface CaretDocument {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as unknown as CaretDocument;
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }
  return null;
}

/** The word at viewport point (x, y) inside `root`, or null (whitespace, margins, outside the text). */
export function wordAt(root: Element, x: number, y: number): string | null {
  const target = document.elementFromPoint(x, y);
  if (!target || !root.contains(target) || target === root) return null;
  const caret = caretAt(x, y);
  if (!caret || caret.node.nodeType !== 3 || !root.contains(caret.node)) return null;
  const text = caret.node.nodeValue || '';
  // The caret sits between two characters: the tapped one may be on either side.
  let i = caret.offset;
  if ((i >= text.length || !WORD_CHAR.test(text.charAt(i))) && i > 0) i--;
  if (!WORD_CHAR.test(text.charAt(i))) return null;
  let start = i;
  let end = i;
  while (start > 0 && WORD_CHAR.test(text.charAt(start - 1))) start--;
  while (end < text.length && WORD_CHAR.test(text.charAt(end))) end++;
  const word = text.slice(start, end).replace(/^['’-]+|['’-]+$/g, '');
  return word.length ? word : null;
}
