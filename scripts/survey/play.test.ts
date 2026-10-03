// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { play } from './play';

const LAMP = readFileSync('tests/fixtures/zmachine/lamp.z5');
const story = () => LAMP.buffer.slice(LAMP.byteOffset, LAMP.byteOffset + LAMP.byteLength);

describe('rendering survey player (S7.3)', () => {
  it('plays the Z-machine fixture through its intro and commands, and finds nothing in ordinary turns', async () => {
    const result = await play(story(), 'zmachine', 20000, 5000, [
      'look',
      'inventory',
      'north',
      'south',
    ]);
    expect(result.findings).toEqual([]);
    expect(result.turns).toBe(5);
  });

  it('reports a menu drawn in the upper window, then browses it back to a line prompt', async () => {
    const result = await play(story(), 'zmachine', 20000, 5000, ['guide', 'look']);
    expect(result.findings).toEqual([{ kind: 'upper-screen', step: 'guide', detail: '6 rows' }]);
  });
});
