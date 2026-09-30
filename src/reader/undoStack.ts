// In-memory turn snapshots for Undo (SPEC §4.4): the last `limit` states, the current one on top.

export const UNDO_LIMIT = 10;

export interface TurnSnapshot {
  turn: number;
}

export class UndoStack<T extends TurnSnapshot> {
  private items: T[] = [];

  constructor(private readonly limit = UNDO_LIMIT) {}

  /** Records the state at the start of a turn. A state of the same turn as the top replaces it. */
  push(item: T): void {
    const top = this.top();
    if (top && top.turn === item.turn) this.items.pop();
    this.items.push(item);
    if (this.items.length > this.limit) this.items.shift();
  }

  top(): T | undefined {
    return this.items[this.items.length - 1];
  }

  get canUndo(): boolean {
    return this.items.length > 1;
  }

  /** Drops the current state and returns the previous one, which becomes current; undefined when there is none. */
  undo(): T | undefined {
    if (!this.canUndo) return undefined;
    this.items.pop();
    return this.top();
  }

  /** Forgets everything but `current` (after a restore or restart: earlier turns belong to another timeline). */
  reset(current?: T): void {
    this.items = current ? [current] : [];
  }

  get size(): number {
    return this.items.length;
  }
}
