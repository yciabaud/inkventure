// Story-file scan (story S7.4): a Glulx reader, as far as the display features need. The ROM (code and strings) is read
// straight through: each function's instructions, and the strings' characters.

/** Operand counts of the Glulx opcodes (Glulx spec 3.1.3, §2). */
const ARITY: Record<number, number> = {
  0x00: 0,
  0x10: 3,
  0x11: 3,
  0x12: 3,
  0x13: 3,
  0x14: 3,
  0x15: 2,
  0x18: 3,
  0x19: 3,
  0x1a: 3,
  0x1b: 2,
  0x1c: 3,
  0x1d: 3,
  0x1e: 3,
  0x20: 1,
  0x22: 2,
  0x23: 2,
  0x24: 3,
  0x25: 3,
  0x26: 3,
  0x27: 3,
  0x28: 3,
  0x29: 3,
  0x2a: 3,
  0x2b: 3,
  0x2c: 3,
  0x2d: 3,
  0x30: 3,
  0x31: 1,
  0x32: 2,
  0x33: 2,
  0x34: 2,
  0x40: 2,
  0x41: 2,
  0x42: 2,
  0x44: 2,
  0x45: 2,
  0x48: 3,
  0x49: 3,
  0x4a: 3,
  0x4b: 3,
  0x4c: 3,
  0x4d: 3,
  0x4e: 3,
  0x4f: 3,
  0x50: 1,
  0x51: 2,
  0x52: 0,
  0x53: 2,
  0x54: 1,
  0x70: 1,
  0x71: 1,
  0x72: 1,
  0x73: 1,
  0x100: 3,
  0x101: 1,
  0x102: 1,
  0x103: 2,
  0x104: 1,
  0x110: 2,
  0x111: 1,
  0x120: 0,
  0x121: 1,
  0x122: 0,
  0x123: 2,
  0x124: 2,
  0x125: 1,
  0x126: 1,
  0x127: 2,
  0x128: 1,
  0x129: 0,
  0x130: 3,
  0x140: 1,
  0x141: 1,
  0x148: 2,
  0x149: 2,
  0x150: 8,
  0x151: 8,
  0x152: 7,
  0x160: 2,
  0x161: 3,
  0x162: 4,
  0x163: 5,
  0x170: 2,
  0x171: 3,
  0x178: 2,
  0x179: 1,
  0x180: 2,
  0x181: 2,
  0x190: 2,
  0x191: 2,
  0x192: 2,
  0x198: 2,
  0x199: 2,
  0x1a0: 3,
  0x1a1: 3,
  0x1a2: 3,
  0x1a3: 3,
  0x1a4: 4,
  0x1a8: 2,
  0x1a9: 2,
  0x1aa: 2,
  0x1ab: 3,
  0x1b0: 2,
  0x1b1: 2,
  0x1b2: 2,
  0x1b3: 2,
  0x1b4: 2,
  0x1b5: 2,
  0x1b6: 3,
  0x1c0: 4,
  0x1c1: 4,
  0x1c2: 3,
  0x1c3: 3,
  0x1c4: 3,
  0x1c5: 3,
  0x1c8: 2,
  0x1c9: 2,
  0x200: 3,
  0x201: 3,
  0x202: 3,
  0x203: 3,
  0x204: 3,
  0x208: 4,
  0x209: 4,
  0x210: 6,
  0x211: 6,
  0x212: 6,
  0x213: 6,
  0x214: 6,
  0x215: 6,
  0x218: 4,
  0x219: 4,
  0x21a: 4,
  0x21b: 6,
  0x220: 4,
  0x221: 4,
  0x222: 4,
  0x223: 4,
  0x224: 4,
  0x225: 4,
  0x226: 6,
  0x230: 7,
  0x231: 7,
  0x232: 5,
  0x233: 5,
  0x234: 5,
  0x235: 5,
  0x238: 3,
  0x239: 3,
};

export interface GOperand {
  /** Addressing mode: 0 zero, 1–3 constant, 5–7 address, 8 stack, 9–B local, D–F RAM. */
  mode: number;
  value: number;
}

export interface GInstruction {
  addr: number;
  op: number;
  operands: GOperand[];
  next: number;
}

/** A constant operand's value, or null. */
export function constant(operand: GOperand | undefined): number | null {
  return operand && operand.mode <= 3 ? operand.value : null;
}

/** Decodes the instruction at `at`; throws on an unknown opcode. */
export function decodeGlulx(mem: Uint8Array, at: number): GInstruction {
  const view = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
  const addr = at;
  const first = mem[at];
  let op: number;
  if (first < 0x80) {
    op = first;
    at += 1;
  } else if (first < 0xc0) {
    op = view.getUint16(at) & 0x3fff;
    at += 2;
  } else {
    throw new Error('not an instruction at ' + addr);
  }
  const count = ARITY[op];
  if (count === undefined) throw new Error('unknown opcode ' + op.toString(16) + ' at ' + addr);
  const modes: number[] = [];
  for (let i = 0; i < count; i += 2) {
    const b = mem[at++];
    modes.push(b & 0x0f);
    if (i + 1 < count) modes.push(b >> 4);
  }
  const operands: GOperand[] = [];
  for (const mode of modes) {
    let value = 0;
    switch (mode) {
      case 0:
      case 8:
        break;
      case 1:
        value = (mem[at] << 24) >> 24;
        at += 1;
        break;
      case 2:
        value = view.getInt16(at);
        at += 2;
        break;
      case 3:
        value = view.getInt32(at);
        at += 4;
        break;
      case 5:
      case 9:
      case 13:
        value = mem[at];
        at += 1;
        break;
      case 6:
      case 10:
      case 14:
        value = view.getUint16(at);
        at += 2;
        break;
      case 7:
      case 11:
      case 15:
        value = view.getUint32(at);
        at += 4;
        break;
      default:
        throw new Error('bad addressing mode at ' + addr);
    }
    operands.push({ mode: mode, value: value });
  }
  if (at > mem.length) throw new Error('past the end at ' + addr);
  return { addr: addr, op: op, operands: operands, next: at };
}

export interface GlulxScan {
  /** Function address → its instructions. */
  functions: Map<number, GInstruction[]>;
  /** Code points the game's strings can print (literal strings and the decoding table). */
  chars: Set<number>;
}

/** A code point that can be printed (not a garbage value). */
function printable(code: number): boolean {
  return code > 0 && code <= 0x10ffff;
}

/**
 * The string decoding table (Glulx spec §1.6.1.4): the characters its nodes print (what compressed strings can
 * print), and a walker that finds where a compressed string ends.
 */
function decodingTable(
  mem: Uint8Array,
  table: number,
  chars: Set<number>,
): ((at: number) => number) | null {
  const view = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
  if (!table || table + 12 > mem.length) return null;
  const root = view.getUint32(table + 8);
  const nodeEnd = (at: number): number => {
    const type = mem[at];
    if (type === 0x00) return at + 9;
    if (type === 0x01) return at + 1;
    if (type === 0x02) return at + 2;
    if (type === 0x03) {
      let end = at + 1;
      while (end < mem.length && mem[end] !== 0) end++;
      return end + 1;
    }
    if (type === 0x04 || type === 0x08 || type === 0x09) return at + 5;
    if (type === 0x05) {
      let end = at + 1;
      while (end + 4 <= mem.length && view.getUint32(end) !== 0) end += 4;
      return end + 4;
    }
    if (type === 0x0a || type === 0x0b) return at + 9 + 4 * view.getUint32(at + 5);
    throw new Error('bad decoding table node at ' + at);
  };
  // Every node, from the root: its characters.
  const todo = [root];
  const seen: Record<number, boolean> = {};
  while (todo.length) {
    const at = todo.pop()!;
    if (seen[at] || at + 1 > mem.length) continue;
    seen[at] = true;
    const type = mem[at];
    if (type === 0x00) {
      todo.push(view.getUint32(at + 1), view.getUint32(at + 5));
    } else if (type === 0x02) {
      chars.add(mem[at + 1]);
    } else if (type === 0x03) {
      for (let c = at + 1; c < mem.length && mem[c] !== 0; c++) chars.add(mem[c]);
    } else if (type === 0x04) {
      if (printable(view.getUint32(at + 1))) chars.add(view.getUint32(at + 1));
    } else if (type === 0x05) {
      for (let c = at + 1; c + 4 <= mem.length && view.getUint32(c) !== 0; c += 4) {
        if (printable(view.getUint32(c))) chars.add(view.getUint32(c));
      }
    }
    nodeEnd(at);
  }
  // A compressed string (0xE1 then bits, low bit first) ends at the terminator node.
  return (start: number) => {
    let at = start + 1;
    let bit = 0;
    for (let steps = 0; steps < 1 << 22; steps++) {
      let node = root;
      while (mem[node] === 0x00) {
        if (at >= mem.length) throw new Error('string past the end');
        const right = (mem[at] >> bit) & 1;
        if (++bit === 8) {
          bit = 0;
          at++;
        }
        node = view.getUint32(node + (right ? 5 : 1));
      }
      if (mem[node] === 0x01) return bit ? at + 1 : at;
    }
    throw new Error('string too long at ' + start);
  };
}

/** Reads the ROM straight through: functions (0xC0 / 0xC1), literal strings (0xE0, 0xE2). */
export function scanGlulx(mem: Uint8Array): GlulxScan {
  const view = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
  if (view.getUint32(0) !== 0x476c756c) throw new Error('not a Glulx story');
  const ramStart = Math.min(view.getUint32(8), mem.length);
  const functions = new Map<number, GInstruction[]>();
  const chars = new Set<number>();
  let compressedEnd: ((at: number) => number) | null;
  try {
    compressedEnd = decodingTable(mem, view.getUint32(28), chars);
  } catch {
    compressedEnd = null;
  }
  let at = 36;
  while (at < ramStart) {
    const type = mem[at];
    if (type === 0xc0 || type === 0xc1) {
      const start = at;
      at++;
      // Locals format: (type, count) pairs up to (0, 0).
      while (at + 1 < ramStart && (mem[at] !== 0 || mem[at + 1] !== 0)) at += 2;
      at += 2;
      const code: GInstruction[] = [];
      try {
        while (at < ramStart && mem[at] < 0xc0) {
          const ins = decodeGlulx(mem, at);
          code.push(ins);
          at = ins.next;
        }
        functions.set(start, code);
      } catch {
        // Not code after all (a table in ROM): look for the next object.
        if (code.length) functions.set(start, code);
        at++;
      }
    } else if (type === 0xe1 && compressedEnd) {
      try {
        at = compressedEnd(at);
      } catch {
        at++;
      }
    } else if (type === 0xe0) {
      at++;
      while (at < ramStart && mem[at] !== 0) chars.add(mem[at++]);
      at++;
    } else if (type === 0xe2 && mem[at + 1] === 0 && mem[at + 2] === 0 && mem[at + 3] === 0) {
      // A Unicode string: 0xE2, three zero bytes, then 32-bit characters up to a zero. Only kept when every character
      // is a real one (a 0xE2 byte inside a table is not a string).
      const found: number[] = [];
      let end = at + 4;
      while (end + 4 <= ramStart && view.getUint32(end) !== 0 && found.length < 10000) {
        found.push(view.getUint32(end));
        end += 4;
      }
      if (found.every((c) => c < 0x30000 && (c < 0xd800 || c > 0xdfff))) {
        for (const c of found) chars.add(c);
        at = end + 4;
      } else {
        at++;
      }
    } else {
      // Other data (tables in ROM): skip a byte.
      at++;
    }
  }
  return { functions: functions, chars: chars };
}
