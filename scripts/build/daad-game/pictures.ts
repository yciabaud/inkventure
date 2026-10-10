// The Lamp Room's two location pictures (story S0.13), drawn here as 320 × 96 pixel art. Picture 1 is the shore
// (location 1), picture 2 the lamp room (location 2): a few flat colours, like an 8-bit adventure's pictures.
//
// `node scripts/build/daad-game/pictures.ts <dir>` writes them as PNG files (to look at) and as jDAAD's images.js,
// in the format DAAD Ready's HTML.BAT gets from its jDAADImager.php: the template's empty table, then per picture
// `images[n]= [pixel, …, x, y, width, height];`, each pixel 0xRRGGBB (opaque), fixed at 0,0. Deterministic, so the
// committed public/probe/daad/images.js can be rebuilt byte for byte (a unit test checks it).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

export const WIDTH = 320;
export const HEIGHT = 96;

type RGB = [number, number, number];

const C: Record<string, RGB> = {
  sky: [170, 190, 205],
  skyLight: [205, 215, 222],
  cloud: [235, 238, 240],
  sea: [40, 70, 110],
  seaLight: [70, 105, 140],
  foam: [230, 235, 240],
  sand: [200, 180, 140],
  pebble: [140, 125, 105],
  pebbleLight: [225, 215, 195],
  white: [245, 245, 240],
  red: [170, 40, 35],
  dark: [25, 25, 30],
  boat: [110, 70, 40],
  boatDark: [70, 45, 25],
  stone: [120, 115, 110],
  stoneDark: [85, 80, 78],
  stoneLight: [150, 145, 138],
  night: [20, 30, 55],
  nightSea: [30, 50, 85],
  glass: [210, 205, 150],
  glassDark: [160, 150, 100],
  brass: [150, 120, 50],
  wood: [120, 85, 50],
  paper: [235, 228, 205],
  ink: [60, 55, 50],
};

export class Picture {
  readonly pixels = new Uint8Array(WIDTH * HEIGHT * 3);

  set(x: number, y: number, c: RGB) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    this.pixels.set(c, (y * WIDTH + x) * 3);
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }

  /** A filled polygon, by the even-odd rule at pixel centres. */
  poly(points: [number, number][], c: RGB) {
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const [xi, yi] = points[i];
          const [xj, yj] = points[j];
          if (yi > y + 0.5 !== yj > y + 0.5) {
            const cross = ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi;
            if (x + 0.5 < cross) inside = !inside;
          }
        }
        if (inside) this.set(x, y, c);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++)
      this.set(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps, c);
  }
}

/** A small deterministic generator (mulberry32), for pebbles and stones. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Location 1: a pebble shore, the lighthouse to the north (right), an old boat, the sea. */
export function shore(): Picture {
  const p = new Picture();
  const rnd = random(1);
  p.rect(0, 0, WIDTH, 50, C.sky);
  p.rect(0, 0, WIDTH, 12, C.skyLight);
  p.ellipse(60, 14, 26, 6, C.cloud);
  p.ellipse(82, 11, 18, 6, C.cloud);
  p.ellipse(150, 22, 20, 4, C.cloud);
  // The sea, with wave crests.
  p.rect(0, 50, WIDTH, 26, C.sea);
  for (let y = 53; y < 72; y += 4) {
    for (let x = (y * 7) % 23; x < WIDTH; x += 23) p.rect(x, y, 8, 1, C.seaLight);
  }
  // The shore.
  p.poly(
    [
      [0, 74],
      [120, 70],
      [220, 66],
      [320, 64],
      [320, 96],
      [0, 96],
    ],
    C.sand,
  );
  for (let i = 0; i < 260; i++) {
    const x = rnd() * WIDTH;
    const y = 74 + rnd() * 22;
    p.rect(x, y, 2, 1, rnd() < 0.5 ? C.pebble : C.pebbleLight);
  }
  // Foam where the waves break.
  for (let x = 0; x < WIDTH; x += 3) p.set(x, 72 - ((x / 3) % 3 === 0 ? 1 : 0) - x / 80, C.foam);
  // Rocks and the lighthouse on its point, to the right.
  p.poly(
    [
      [205, 66],
      [222, 52],
      [270, 48],
      [300, 56],
      [320, 58],
      [320, 66],
    ],
    C.stoneDark,
  );
  p.poly(
    [
      [240, 50],
      [246, 14],
      [266, 14],
      [272, 50],
    ],
    C.white,
  );
  for (const y of [22, 36]) p.rect(243, y, 27, 5, C.red);
  p.rect(244, 8, 24, 6, C.dark); // gallery
  p.rect(248, 2, 16, 6, C.glass); // the dark lamp
  p.rect(247, 1, 18, 1, C.dark);
  p.rect(252, 40, 8, 10, C.dark); // the open door
  // The old boat, upturned on the beach to the left.
  p.poly(
    [
      [30, 84],
      [92, 84],
      [84, 76],
      [38, 76],
    ],
    C.boat,
  );
  p.rect(38, 76, 46, 2, C.boatDark);
  p.rect(58, 82, 6, 4, C.paper); // the box of matches, by the boat
  return p;
}

/** Location 2: the lamp room, a great dark lantern among night windows, the keeper's log on a shelf. */
export function lampRoom(): Picture {
  const p = new Picture();
  const rnd = random(2);
  // Stone walls.
  p.rect(0, 0, WIDTH, HEIGHT, C.stone);
  for (let y = 0; y < 80; y += 8) {
    const offset = (y / 8) % 2 ? 12 : 0;
    p.rect(0, y, WIDTH, 1, C.stoneDark);
    for (let x = offset; x < WIDTH; x += 24) p.rect(x, y, 1, 8, C.stoneDark);
  }
  for (let i = 0; i < 120; i++) p.set(rnd() * WIDTH, rnd() * 80, C.stoneLight);
  // Three windows on the night sea.
  for (const x of [40, 130, 220]) {
    p.rect(x, 10, 60, 40, C.dark);
    p.rect(x + 2, 12, 56, 36, C.night);
    p.rect(x + 2, 34, 56, 14, C.nightSea);
    p.rect(x + 29, 12, 2, 36, C.dark);
    p.rect(x + 2, 29, 56, 2, C.dark);
  }
  p.set(52, 18, C.cloud);
  p.set(158, 15, C.cloud);
  p.set(246, 21, C.cloud);
  // The floor.
  p.rect(0, 80, WIDTH, 16, C.wood);
  for (let x = 0; x < WIDTH; x += 20) p.rect(x, 80, 1, 16, C.boatDark);
  p.rect(0, 80, WIDTH, 1, C.boatDark);
  // The stair going down, on the left.
  p.rect(6, 84, 40, 12, C.dark);
  for (let s = 0; s < 4; s++) p.rect(8 + s * 9, 86 + s * 3, 9, 1, C.stoneDark);
  // The great lantern in the middle.
  p.rect(140, 74, 40, 8, C.brass);
  p.poly(
    [
      [142, 74],
      [146, 30],
      [174, 30],
      [178, 74],
    ],
    C.glassDark,
  );
  p.poly(
    [
      [148, 70],
      [151, 34],
      [169, 34],
      [172, 70],
    ],
    C.glass,
  );
  for (let y = 38; y < 70; y += 8) p.rect(149, y, 22, 1, C.glassDark);
  p.rect(158, 34, 4, 36, C.glassDark); // the wick
  p.poly(
    [
      [144, 30],
      [160, 18],
      [176, 30],
    ],
    C.brass,
  );
  p.rect(158, 14, 4, 4, C.brass);
  // The shelf and the open log, on the right.
  p.rect(262, 58, 50, 3, C.wood);
  p.rect(268, 61, 3, 8, C.wood);
  p.rect(304, 61, 3, 8, C.wood);
  p.poly(
    [
      [266, 58],
      [270, 52],
      [287, 53],
      [287, 58],
    ],
    C.paper,
  );
  p.poly(
    [
      [287, 58],
      [287, 53],
      [304, 52],
      [308, 58],
    ],
    C.paper,
  );
  for (let i = 0; i < 4; i++) {
    p.line(271, 54 + i, 284, 54 + i, i % 2 ? C.paper : C.ink);
    p.line(290, 54 + i, 303, 54 + i, i % 2 ? C.paper : C.ink);
  }
  return p;
}

// --- PNG (8-bit RGB, no filter) ------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function png(picture: Picture): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (WIDTH * 3 + 1)] = 0;
    raw.set(picture.pixels.subarray(y * WIDTH * 3, (y + 1) * WIDTH * 3), y * (WIDTH * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

// --- jDAAD's images.js ----------------------------------------------------------------------------------

/** One picture as jDAADImager writes it: ten pixels a line, then the position and size. */
export function imageEntry(n: number, picture: Picture, x = 0, y = 0): string {
  let out = `images[${n}]= [`;
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const [r, g, b] = picture.pixels.subarray(i * 3, i * 3 + 3);
    out += `${(r << 16) | (g << 8) | b}, `;
    if (i % 10 === 9) out += '\n';
  }
  return out + `${x}, ${y}, ${WIDTH}, ${HEIGHT}];\n\n`;
}

/** images.js: DAAD Ready's empty table (ASSETS/HTML/images.js), then the pictures. */
export function imagesJs(): string {
  return (
    'var images = [];\nfor (i=0;i<256;i++) images[i] = null;\n' +
    imageEntry(1, shore()) +
    imageEntry(2, lampRoom())
  );
}

if (process.argv[1] && /pictures\.ts$/.test(process.argv[1])) {
  const dir = process.argv[2] || '.';
  writeFileSync(join(dir, '001.png'), png(shore()));
  writeFileSync(join(dir, '002.png'), png(lampRoom()));
  writeFileSync(join(dir, 'images.js'), imagesJs());
  console.log('Wrote 001.png, 002.png and images.js to ' + dir);
}
