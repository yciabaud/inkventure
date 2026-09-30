import { describe, expect, it } from 'vitest';
import { UNDO_LIMIT, UndoStack } from './undoStack';

const at = (turn: number) => ({ turn, label: 'turn ' + turn });

describe('UndoStack', () => {
  it('goes back one turn at a time', () => {
    const stack = new UndoStack<ReturnType<typeof at>>();
    expect(stack.canUndo).toBe(false);
    expect(stack.undo()).toBeUndefined();
    stack.push(at(0));
    expect(stack.canUndo).toBe(false);
    stack.push(at(1));
    stack.push(at(2));
    expect(stack.undo()).toEqual(at(1));
    expect(stack.top()).toEqual(at(1));
    expect(stack.undo()).toEqual(at(0));
    expect(stack.canUndo).toBe(false);
    expect(stack.undo()).toBeUndefined();
    expect(stack.top()).toEqual(at(0));
  });

  it('keeps the last states only', () => {
    const stack = new UndoStack<ReturnType<typeof at>>();
    for (let i = 0; i < 25; i++) stack.push(at(i));
    expect(stack.size).toBe(UNDO_LIMIT);
    let undone = 0;
    while (stack.undo()) undone++;
    expect(undone).toBe(UNDO_LIMIT - 1);
    expect(stack.top()).toEqual(at(25 - UNDO_LIMIT));
  });

  it('replaces a state of the same turn, and resets to a single state', () => {
    const stack = new UndoStack<ReturnType<typeof at>>(3);
    stack.push(at(1));
    stack.push({ turn: 1, label: 'again' });
    expect(stack.size).toBe(1);
    expect(stack.top()!.label).toBe('again');
    stack.push(at(2));
    stack.reset(at(9));
    expect(stack.size).toBe(1);
    expect(stack.canUndo).toBe(false);
    stack.reset();
    expect(stack.top()).toBeUndefined();
  });
});
