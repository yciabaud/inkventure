import { describe, expect, it } from 'vitest';
import { applyChip, applyNoun, awaitsObject, browseHistory, insertWord } from './compose';
import { nounsIn, recentNouns } from './nouns';
import { verbTable } from './verbs';

const en = verbTable('en');
const fr = verbTable('fr');

describe('verbTable', () => {
  it('selects the table from a language code or name, English by default', () => {
    expect(verbTable('fr-FR').language).toBe('fr');
    expect(verbTable('French').language).toBe('fr');
    expect(verbTable('de').language).toBe('de');
    expect(verbTable('pt-BR').language).toBe('en');
    expect(verbTable(undefined).language).toBe('en');
  });

  it('has the same chips in every language', () => {
    for (const code of ['en', 'fr', 'es', 'de', 'it']) {
      const table = verbTable(code);
      expect(table.directions.map((d) => d.id)).toEqual(en.directions.map((d) => d.id));
      expect(table.verbs.map((v) => v.id)).toEqual(en.verbs.map((v) => v.id));
      for (const verb of table.verbs) expect(verb.label.endsWith('…')).toBe(verb.needsObject);
    }
  });

  it('uses the game language for commands', () => {
    expect(fr.directions.find((d) => d.id === 'n')!.command).toBe('nord');
    expect(fr.verbs.find((v) => v.id === 'take')!.label).toBe('Prendre…');
    expect(en.verbs.find((v) => v.id === 'talk')!.command).toBe('talk to');
  });
});

describe('noun extraction', () => {
  it('finds English head nouns after articles', () => {
    expect(
      nounsIn('The tower door stands open; a wooden shed leans against the rocks.', en),
    ).toEqual(['door', 'shed', 'rocks']);
    expect(nounsIn('You can see a paraffin can here.', en)).toEqual(['can']);
    expect(nounsIn('On the shelf is a box of matches.', en)).toEqual(['shelf', 'box']);
    expect(nounsIn('A wooden shed with a rope looped round its door.', en)).toEqual([
      'shed',
      'rope',
    ]);
    expect(nounsIn('An old brass lamp and a key lie on the table.', en)).toEqual([
      'lamp',
      'key',
      'table',
    ]);
  });

  it('finds French head nouns, including elided articles', () => {
    expect(nounsIn('Vous voyez une lampe ancienne et une clé.', fr)).toEqual(['lampe', 'clé']);
    expect(nounsIn("Il y a une boîte d'allumettes sur l'étagère.", fr)).toEqual([
      'boîte',
      'étagère',
    ]);
    expect(nounsIn('La porte du phare est fermée.', fr)).toEqual(['porte', 'phare']);
  });

  it('keeps recent nouns first, deduplicated, without directions or the room name', () => {
    const paragraphs = [
      'Landing Stage',
      'A jetty. The path leads to the north. You can see a paraffin can here.',
      '>take can',
      'Taken. The lamp is dark; a box of matches would help.',
    ];
    expect(recentNouns(paragraphs, en, 'Landing Stage')).toEqual([
      'lamp',
      'box',
      'jetty',
      'path',
      'can',
    ]);
  });

  it('caps the number of chips', () => {
    const text = 'a apple, a banana, a cherry, a dates, a elder, a figs, a grape, a hazel, a iris.';
    expect(recentNouns([text], en, '', 3)).toEqual(['apple', 'banana', 'cherry']);
  });
});

describe('command composition', () => {
  const take = en.verbs.find((v) => v.id === 'take')!;
  const look = en.verbs.find((v) => v.id === 'look')!;
  const north = en.directions.find((d) => d.id === 'n')!;

  it('sends directions and plain verbs, puts object verbs in the field', () => {
    expect(applyChip(north)).toEqual({ send: 'north' });
    expect(applyChip(look)).toEqual({ send: 'look' });
    expect(applyChip(take)).toEqual({ field: 'take ' });
  });

  it('completes a waiting verb with a noun and sends it', () => {
    expect(awaitsObject('take ', en.verbs)).toBe(true);
    expect(awaitsObject('take', en.verbs)).toBe(false);
    expect(applyNoun('take ', 'lamp', en.verbs)).toEqual({ send: 'take lamp' });
    expect(applyNoun('talk to ', 'keeper', en.verbs)).toEqual({ send: 'talk to keeper' });
    expect(applyNoun('', 'lamp', en.verbs)).toEqual({ field: 'lamp ' });
    expect(applyNoun('put ', 'lamp', en.verbs)).toEqual({ field: 'put lamp ' });
  });

  it('inserts tapped words cleanly', () => {
    expect(insertWord('', 'Lamp.')).toBe('lamp ');
    expect(insertWord('light', '“lamp”,')).toBe('light lamp ');
    expect(insertWord('light ', '…')).toBe('light ');
  });

  it('browses the history', () => {
    const history = ['look', 'take can', 'north'];
    expect(browseHistory(history, 3, -1)).toEqual({ position: 2, field: 'north' });
    expect(browseHistory(history, 0, -1)).toEqual({ position: 0, field: 'look' });
    expect(browseHistory(history, 2, 1)).toEqual({ position: 3, field: '' });
  });
});
