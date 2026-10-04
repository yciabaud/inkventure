// Story-file scan (story S7.4): the executable chunk of a Blorb file (IFF FORM IFRS), or the file itself.

/** The story in `bytes`: its `ZCOD` or `GLUL` chunk when it is a Blorb, else `bytes` unchanged. */
export function executable(bytes: Uint8Array): Uint8Array {
  const tag = (at: number) =>
    String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (bytes.length < 12 || tag(0) !== 'FORM' || tag(8) !== 'IFRS') return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const type = tag(at);
    const size = view.getUint32(at + 4);
    if (type === 'ZCOD' || type === 'GLUL') return bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size & 1);
  }
  throw new Error('Blorb without an executable chunk');
}

/** The story's format, from its first bytes. */
export function formatOf(story: Uint8Array): 'zmachine' | 'glulx' | null {
  if (
    story.length > 4 &&
    story[0] === 0x47 &&
    story[1] === 0x6c &&
    story[2] === 0x75 &&
    story[3] === 0x6c
  ) {
    return 'glulx';
  }
  if (story.length > 64 && story[0] >= 1 && story[0] <= 8) return 'zmachine';
  return null;
}
