// Packs the illustrated Glulx fixture: tests/fixtures/glulx/picture.ulx plus one picture drawn here (a small colour
// PNG, so the grayscale filter shows) and its alt text, into picture.gblorb (Blorb: FORM IFRS with RIdx, RDes, GLUL
// and PNG chunks). Run by scripts/fixtures/build-glulx.sh after the compiler; the .gblorb is committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const DIR = 'tests/fixtures/glulx/';
export const PICTURE_WIDTH = 600;
export const PICTURE_HEIGHT = 400;
export const PICTURE_ALT = 'A painting of a lighthouse at dusk, its lamp lit above a dark sea.';

function u32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function concat(parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat([ascii(type), data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

/** The picture: an orange sky, a dark blue sea and a red and white tower with a yellow lamp. */
export function drawPicture(): Uint8Array {
  const w = PICTURE_WIDTH;
  const h = PICTURE_HEIGHT;
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // no filter
    for (let x = 0; x < w; x++) {
      let rgb = y < h * 0.65 ? [240, 150, 60] : [20, 40, 110];
      const inTower = x >= 270 && x < 330 && y >= 90 && y < h * 0.7;
      if (inTower) rgb = Math.floor((y - 90) / 40) % 2 ? [255, 255, 255] : [200, 20, 20];
      if (x >= 280 && x < 320 && y >= 55 && y < 90) rgb = [255, 230, 0];
      raw.set(rgb, row + 1 + x * 3);
    }
  }
  const header = concat([u32(w), u32(h), new Uint8Array([8, 2, 0, 0, 0])]); // 8-bit RGB
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function iffChunk(type: string, data: Uint8Array): Uint8Array {
  return concat([ascii(type), u32(data.length), data, new Uint8Array(data.length & 1)]);
}

/** A Blorb holding the Glulx game (Exec 0) and the pictures (Pict 1, 2…), with their alt texts. */
export function packBlorb(
  game: Uint8Array,
  pictures: Array<{ png: Uint8Array; alt?: string }>,
): Uint8Array {
  const resources = [{ usage: 'Exec', number: 0, chunk: iffChunk('GLUL', game) }];
  pictures.forEach((picture, i) => {
    resources.push({ usage: 'Pict', number: i + 1, chunk: iffChunk('PNG ', picture.png) });
  });
  const descriptions: Uint8Array[] = [];
  pictures.forEach((picture, i) => {
    if (!picture.alt) return;
    const text = new TextEncoder().encode(picture.alt);
    descriptions.push(concat([ascii('Pict'), u32(i + 1), u32(text.length), text]));
  });
  const rdes = descriptions.length
    ? iffChunk('RDes', concat([u32(descriptions.length)].concat(descriptions)))
    : new Uint8Array(0);
  // Offsets are from the start of the file: FORM header (12), then RIdx, then RDes, then the resources.
  const ridxSize = 8 + 4 + resources.length * 12;
  let at = 12 + ridxSize + rdes.length;
  const index: Uint8Array[] = [u32(resources.length)];
  for (const resource of resources) {
    index.push(ascii(resource.usage), u32(resource.number), u32(at));
    at += resource.chunk.length;
  }
  const body = concat(
    [ascii('IFRS'), iffChunk('RIdx', concat(index)), rdes].concat(resources.map((r) => r.chunk)),
  );
  return concat([ascii('FORM'), u32(body.length), body]);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const game = readFileSync(DIR + 'picture.ulx');
  const blorb = packBlorb(new Uint8Array(game), [{ png: drawPicture(), alt: PICTURE_ALT }]);
  writeFileSync(DIR + 'picture.gblorb', blorb);
  console.log('Wrote ' + DIR + 'picture.gblorb (' + blorb.length + ' bytes)');
}
