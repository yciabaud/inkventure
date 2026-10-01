// QR codes for the ebook's game cards (SPEC §8; story S6.1), as PNG: e-reader conversions keep raster images best.
import qrcode from 'qrcode-generator';
import { encodeGrayPng } from './png.ts';

/** Dark modules of the QR code of `text` (error correction M: a smudged e-ink page still scans). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(qr.isDark(y, x));
    rows.push(row);
  }
  return rows;
}

/** PNG of the QR code of `text`: `scale` px per module, with the standard 4-module quiet zone. */
export function qrPng(text: string, scale = 8): Uint8Array {
  const matrix = qrMatrix(text);
  const margin = 4;
  const side = (matrix.length + 2 * margin) * scale;
  const pixels = new Uint8Array(side * side).fill(255);
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        const start = ((y + margin) * scale + dy) * side + (x + margin) * scale;
        pixels.fill(0, start, start + scale);
      }
    });
  });
  return encodeGrayPng(side, side, pixels);
}

/** A game card's QR code image: its path in the book and the PNG of its deep link. */
export function cardQr(card: { url: string; qr: string }): { path: string; png: Uint8Array } {
  return { path: card.qr, png: qrPng(card.url) };
}
