// Story-file scan (story S7.4): a Z-machine disassembler, as far as the display features need. It finds the routines
// (from the start, the calls, and the packed addresses kept in tables: property routines), decodes them by following
// their branches, and lists the opcodes the reader cares about.

export interface Operand {
  type: 'large' | 'small' | 'var';
  value: number;
}

export interface Instruction {
  addr: number;
  form: '0OP' | '1OP' | '2OP' | 'VAR' | 'EXT';
  op: number;
  operands: Operand[];
  /** Where the next instruction starts. */
  next: number;
  /** Branch target (an address), when it is not a return. */
  branch?: number;
  /** Ends the routine's flow (return, jump, quit…). */
  stops: boolean;
}

const BRANCH_2OP = [1, 2, 3, 4, 5, 6, 7, 10];

// Operand counts [min, max] of the VAR and EXT opcodes (Z-machine Standard 1.1, §15), so that data decoded as code is
// refused: a "routine" found in a table that is not one soon has an instruction with the wrong number of operands.
const VAR_ARITY: Array<[number, number]> = [
  [1, 4],
  [3, 3],
  [3, 3],
  [3, 3],
  [1, 4],
  [1, 1],
  [1, 1],
  [1, 1],
  [1, 1],
  [0, 1],
  [1, 1],
  [1, 1],
  [1, 8],
  [1, 1],
  [1, 1],
  [2, 3],
  [1, 1],
  [1, 1],
  [1, 1],
  [1, 3],
  [1, 1],
  [0, 4],
  [1, 3],
  [3, 4],
  [1, 1],
  [1, 4],
  [1, 8],
  [2, 4],
  [4, 4],
  [3, 3],
  [2, 4],
  [1, 1],
];
const EXT_ARITY: Record<number, [number, number]> = {
  0: [0, 3],
  1: [0, 3],
  2: [2, 2],
  3: [2, 2],
  4: [1, 2],
  5: [1, 3],
  6: [2, 2],
  7: [1, 3],
  8: [3, 3],
  9: [0, 0],
  10: [0, 0],
  11: [1, 1],
  12: [1, 1],
  13: [2, 3],
  16: [3, 3],
  17: [3, 3],
  18: [2, 3],
  19: [2, 2],
  20: [2, 2],
  21: [1, 2],
  22: [1, 1],
  23: [1, 1],
  24: [2, 2],
  25: [3, 3],
  26: [1, 1],
  27: [2, 2],
  28: [1, 1],
  29: [1, 1],
};
const STORE_2OP = [8, 9, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const BRANCH_EXT = [6, 24, 27];
const STORE_EXT = [0, 1, 2, 3, 4, 9, 10, 12, 19, 29];

/** Byte address of a packed routine address. */
export function unpackRoutine(packed: number, version: number, header: DataView): number {
  if (version <= 3) return packed * 2;
  if (version <= 5) return packed * 4;
  if (version <= 7) return packed * 4 + header.getUint16(0x28) * 8;
  return packed * 8;
}

/** Decodes the instruction at `addr`; throws on an opcode the version does not have, or past the end. */
export function decode(mem: Uint8Array, addr: number, version: number): Instruction {
  let at = addr;
  const byte = () => {
    if (at >= mem.length) throw new Error('past the end at ' + addr);
    return mem[at++];
  };
  const operands: Operand[] = [];
  const read = (type: number) => {
    if (type === 0) operands.push({ type: 'large', value: (byte() << 8) | byte() });
    else if (type === 1) operands.push({ type: 'small', value: byte() });
    else if (type === 2) operands.push({ type: 'var', value: byte() });
  };
  const types = (b: number) => {
    const list: number[] = [];
    for (let shift = 6; shift >= 0; shift -= 2) {
      const type = (b >> shift) & 3;
      if (type === 3) break;
      list.push(type);
    }
    return list;
  };
  let form: Instruction['form'];
  let op: number;
  const first = byte();
  if (first === 0xbe && version >= 5) {
    form = 'EXT';
    op = byte();
    types(byte()).forEach(read);
  } else if (first >= 0xc0) {
    form = first & 0x20 ? 'VAR' : '2OP';
    op = first & 0x1f;
    const list = types(byte());
    // call_vs2 and call_vn2 take up to 8 operands, with a second types byte.
    if (form === 'VAR' && (op === 12 || op === 26)) {
      const more = types(byte());
      if (list.length === 4) list.push(...more);
    }
    list.forEach(read);
  } else if (first >= 0x80) {
    const type = (first >> 4) & 3;
    op = first & 0x0f;
    if (type === 3) form = '0OP';
    else {
      form = '1OP';
      read(type);
    }
  } else {
    form = '2OP';
    op = first & 0x1f;
    read(first & 0x40 ? 2 : 1);
    read(first & 0x20 ? 2 : 1);
  }
  if (!validOp(form, op, version) || !validArity(form, op, operands.length)) {
    throw new Error('invalid ' + form + ':' + op + ' at ' + addr);
  }
  if (stores(form, op, version)) byte();
  let branch: number | undefined;
  let stops = false;
  if (branches(form, op, version)) {
    const b = byte();
    let offset = b & 0x3f;
    if (!(b & 0x40)) {
      offset = (offset << 8) | byte();
      if (offset & 0x2000) offset -= 0x4000;
    }
    if (offset > 1) branch = at + offset - 2;
  }
  if (form === '0OP' && (op === 2 || op === 3)) {
    // Inline text: words until the one with its top bit set.
    for (;;) {
      const high = byte();
      byte();
      if (high & 0x80) break;
    }
  }
  if (form === '1OP' && op === 12) {
    // jump: a signed offset, the flow goes there.
    let offset = operands[0].value;
    if (offset & 0x8000) offset -= 0x10000;
    branch = at + offset - 2;
    stops = true;
  }
  if (form === '0OP' && [0, 1, 3, 7, 8, 10].indexOf(op) >= 0) stops = true;
  if (form === '1OP' && op === 11) stops = true;
  if (form === '2OP' && op === 28) stops = true;
  return {
    addr: addr,
    form: form,
    op: op,
    operands: operands,
    next: at,
    branch: branch,
    stops: stops,
  };
}

function validArity(form: Instruction['form'], op: number, count: number): boolean {
  if (form === '2OP')
    return op === 1 ? count >= 2 : op === 27 ? count >= 2 && count <= 3 : count === 2;
  const range = form === 'VAR' ? VAR_ARITY[op] : form === 'EXT' ? EXT_ARITY[op] : null;
  return !range || (count >= range[0] && count <= range[1]);
}

function validOp(form: Instruction['form'], op: number, version: number): boolean {
  if (form === '2OP') {
    if (op === 0 || op > 28) return false;
    if (op === 25) return version >= 4;
    if (op >= 26) return version >= 5;
    return true;
  }
  if (form === '1OP') return op !== 8 || version >= 4;
  if (form === '0OP') {
    if (op === 14) return false;
    if ((op === 5 || op === 6) && version >= 5) return false;
    if (op === 15) return version >= 5;
    return true;
  }
  if (form === 'EXT') return op <= 29 && op !== 14 && op !== 15;
  return true;
}

function stores(form: Instruction['form'], op: number, version: number): boolean {
  if (form === '2OP') return STORE_2OP.indexOf(op) >= 0;
  if (form === '1OP') return [1, 2, 3, 4, 8, 14].indexOf(op) >= 0 || (op === 15 && version <= 4);
  if (form === '0OP')
    return ((op === 5 || op === 6) && version === 4) || (op === 9 && version >= 5);
  if (form === 'EXT') return STORE_EXT.indexOf(op) >= 0;
  return (
    op === 0 ||
    op === 7 ||
    op === 12 ||
    op === 22 ||
    op === 23 ||
    (op === 4 && version >= 5) ||
    (op === 24 && version >= 5) ||
    (op === 9 && version === 6)
  );
}

function branches(form: Instruction['form'], op: number, version: number): boolean {
  if (form === '2OP') return BRANCH_2OP.indexOf(op) >= 0;
  if (form === '1OP') return op <= 2;
  if (form === '0OP') return ((op === 5 || op === 6) && version <= 3) || op === 13 || op === 15;
  if (form === 'EXT') return BRANCH_EXT.indexOf(op) >= 0;
  return op === 23 || op === 31;
}

/** The instructions of the routine at `addr` (its header skipped), following its branches; throws when invalid. */
export function routine(
  mem: Uint8Array,
  addr: number,
  version: number,
  header = true,
): Instruction[] {
  let start = addr;
  if (header) {
    const locals = mem[addr];
    if (locals === undefined || locals > 15) throw new Error('not a routine at ' + addr);
    start = addr + 1 + (version <= 4 ? 2 * locals : 0);
  }
  const seen: Record<number, Instruction> = {};
  const todo = [start];
  let count = 0;
  while (todo.length) {
    let at = todo.pop()!;
    while (!seen[at]) {
      const ins = decode(mem, at, version);
      seen[at] = ins;
      if (++count > 20000) throw new Error('routine too long at ' + addr);
      if (ins.branch !== undefined) {
        if (ins.branch < 0 || ins.branch >= mem.length)
          throw new Error('branch out of the file at ' + at);
        todo.push(ins.branch);
      }
      if (ins.stops) break;
      at = ins.next;
    }
  }
  return Object.keys(seen)
    .map(Number)
    .sort((a, b) => a - b)
    .map((a) => seen[a]);
}

/**
 * The routine at `addr` read straight through (as txd does): it ends after an instruction that stops the flow, past
 * every branch target seen so far. Throws when an instruction is invalid.
 */
export function sweepRoutine(mem: Uint8Array, addr: number, version: number): Instruction[] {
  const locals = mem[addr];
  if (locals === undefined || locals > 15) throw new Error('not a routine at ' + addr);
  return sweep(mem, addr + 1 + (version <= 4 ? 2 * locals : 0), version, []);
}

/** Instructions from `at` on, appended to `code`, until one stops the flow past every branch target. */
function sweep(mem: Uint8Array, at: number, version: number, code: Instruction[]): Instruction[] {
  let furthest = at;
  for (const ins of code)
    if (ins.branch !== undefined && ins.branch > furthest) furthest = ins.branch;
  for (;;) {
    const ins = decode(mem, at, version);
    code.push(ins);
    if (code.length > 50000) throw new Error('routine too long at ' + at);
    if (ins.branch !== undefined && ins.branch > furthest) furthest = ins.branch;
    at = ins.next;
    if (ins.stops && at > furthest) return code;
  }
}

/** The routine a call names, when it is a constant: call_vs(2), call_vn(2), call_1s/1n, call_2s/2n. */
function callTarget(ins: Instruction): Operand | null {
  const call =
    (ins.form === 'VAR' && (ins.op === 0 || ins.op === 12 || ins.op === 25 || ins.op === 26)) ||
    (ins.form === '1OP' && (ins.op === 8 || (ins.op === 15 && ins.operands.length > 0))) ||
    (ins.form === '2OP' && (ins.op === 25 || ins.op === 26));
  const first = ins.operands[0];
  return call && first && first.type === 'large' && first.value ? first : null;
}

export interface Disassembly {
  version: number;
  /** Routine address → its instructions. */
  routines: Map<number, Instruction[]>;
  /** Where the code ends (the strings follow). */
  codeEnd: number;
  /** The Unicode translation table, when the game has its own (version 5+). */
  unicode: number[] | null;
}

/**
 * All the routines of a Z-machine story. Compilers (Inform, ZIL) lay the routines out one after the other from the
 * start of high memory, each aligned on a packed address, then the strings: the code is read straight through until a
 * routine no longer decodes.
 */
export function disassemble(mem: Uint8Array): Disassembly {
  const version = mem[0];
  if (version < 1 || version > 8) throw new Error('not a Z-machine story');
  const header = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
  const unit = version <= 3 ? 2 : version <= 7 ? 4 : 8;
  const routines = new Map<number, Instruction[]>();
  let at = header.getUint16(0x04);
  let codeEnd = at;
  let last: Instruction[] | null = null;
  const targets: Record<number, boolean> = {};
  while (at < mem.length) {
    let code: Instruction[] | null = null;
    // Padding up to the next packed address.
    for (let skip = 0; skip < unit && !code; skip++) {
      try {
        code = sweepRoutine(mem, at + skip, version);
        at += skip;
      } catch {
        code = null;
      }
    }
    if (!code && last) {
      // Code after a return that no branch reaches (dead code a compiler left): the routine goes on.
      try {
        sweep(mem, codeEnd, version, last);
        codeEnd = last[last.length - 1].next;
        at = Math.ceil(codeEnd / unit) * unit;
        continue;
      } catch {
        last = null;
      }
    }
    if (!code) {
      // Something the sweep cannot read: start again at the next routine some call names.
      const next = Object.keys(targets)
        .map(Number)
        .filter((t) => t > at && !routines.has(t))
        .sort((a, b) => a - b)[0];
      if (next === undefined) break;
      at = next;
      continue;
    }
    for (const ins of code) {
      const target = callTarget(ins);
      if (target) targets[unpackRoutine(target.value, version, header)] = true;
    }
    routines.set(at, code);
    last = code;
    codeEnd = code[code.length - 1].next;
    at = Math.ceil(codeEnd / unit) * unit;
  }
  // Routines the sweep stepped over (inside a part it could not read): read on their own, following their branches.
  for (const key of Object.keys(targets)) {
    const target = Number(key);
    if (routines.has(target) || target >= mem.length) continue;
    try {
      routines.set(target, routine(mem, target, version));
    } catch {
      // Not a routine after all (a computed address).
    }
  }
  let unicode: number[] | null = null;
  const extension = version >= 5 ? header.getUint16(0x36) : 0;
  if (extension && extension + 8 <= mem.length && header.getUint16(extension) >= 3) {
    const table = header.getUint16(extension + 6);
    if (table && table < mem.length) {
      unicode = [];
      for (let i = 0; i < mem[table]; i++) unicode.push(header.getUint16(table + 1 + 2 * i));
    }
  }
  return { version: version, routines: routines, codeEnd: codeEnd, unicode: unicode };
}
