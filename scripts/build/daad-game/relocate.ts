// DAAD spike (story S0.13): turns a DAAD database (DDB) built for another machine into one jDAAD reads.
//
// jDAAD reads the DDB the DAAD Reborn Compiler (DRC) writes for its HTML target, which is the PC's: 16-bit words
// little-endian, and pointers counted from the start of the file (base address 0). Other targets differ only in that:
// the Atari ST and the Amiga write words big-endian, and the 8-bit machines add the address the database is loaded
// at (the Spectrum 0x8400, the MSX 0x0100, the CPC 0x2880, the C64 0x3880…). jDAAD does neither, so such a DDB loops
// forever on its first pointer. Relocating every pointer and writing it little-endian is enough: the S0.13 test game,
// built by DRC for the Spectrum (v2 "classic" and v3), the MSX and the ST, then relocated, plays like the HTML build.
//
// The pointers of a DDB: 13 words of the header (from byte 8), the process table and each process's entries (the
// condacts' address, bytes 2–3 of each 4-byte entry, until a 0 verb), and the lookup tables of objects, locations,
// user and system messages, and connections. The 13 extern vectors after the header are only byte-swapped.
//
//   node scripts/build/daad-game/relocate.ts <in.ddb> <out.jddb> <base address> [le|be]
import { readFileSync, writeFileSync } from 'node:fs';

export interface Relocated {
  ddb: Uint8Array;
  /** How many pointers were moved. */
  pointers: number;
}

/** The DDB with its pointers counted from 0, little-endian. `base` is the load address, `bigEndian` the ST/Amiga. */
export function relocateDdb(input: Uint8Array, base: number, bigEndian = false): Relocated {
  const d = Uint8Array.from(input);
  const read = (at: number) => (bigEndian ? d[at] * 256 + d[at + 1] : d[at] + d[at + 1] * 256);
  const write = (at: number, value: number) => {
    d[at] = value & 0xff;
    d[at + 1] = (value >> 8) & 0xff;
  };
  const done = new Map<number, number>();
  const pointer = (at: number) => {
    const seen = done.get(at);
    if (seen != null) return seen;
    const value = read(at);
    const moved = value === 0 ? 0 : value - base;
    if (moved < 0 || moved > d.length) {
      throw new Error(
        `pointer at ${at} is ${value}, outside a ${d.length}-byte DDB loaded at ${base}`,
      );
    }
    write(at, moved);
    done.set(at, moved);
    return moved;
  };
  const table = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => pointer(start + i * 2));

  const [objects, locations, messages, sysmess, processes] = [d[3], d[4], d[5], d[6], d[7]];
  // Header: compressed text, processes, objects, locations, messages, system messages, connections, vocabulary,
  // objects' initial locations, names, weights, attributes, file length.
  const header = table(8, 13);
  for (let i = 0; i < 13; i++) write(34 + i * 2, read(34 + i * 2)); // extern vectors: byte order only
  for (const process of table(header[1], processes)) {
    for (let entry = process; d[entry] !== 0; entry += 4) pointer(entry + 2);
  }
  table(header[2], objects);
  table(header[3], locations);
  table(header[4], messages);
  table(header[5], sysmess);
  table(header[6], locations);
  return { ddb: d, pointers: done.size };
}

/** The DDB as jDAAD loads it: a script defining DDBDATA (as DRC writes lamp.jddb, without its offset comments). */
export function toJddb(ddb: Uint8Array): string {
  return 'var DDBDATA = [' + Array.from(ddb, (b) => '0x' + b.toString(16)).join(',') + '];\n';
}

if (process.argv[1] && process.argv[1].endsWith('relocate.ts')) {
  const [input, output, base, order] = process.argv.slice(2);
  if (!input || !output || base == null) {
    console.error(
      'Usage: node scripts/build/daad-game/relocate.ts <in.ddb> <out.jddb> <base> [le|be]',
    );
    process.exit(1);
  }
  const { ddb, pointers } = relocateDdb(readFileSync(input), Number(base), order === 'be');
  writeFileSync(output, toJddb(ddb));
  console.log(
    `${output}: ${pointers} pointers relocated from ${base}${order === 'be' ? ', big-endian' : ''}`,
  );
}
