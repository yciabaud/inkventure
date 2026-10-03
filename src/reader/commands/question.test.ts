import { describe, expect, it } from 'vitest';
import { MAX_OPTIONS, parserQuestion, questionOptions } from './question';

const ask = (...paragraphs: string[]) => parserQuestion(paragraphs);

describe('parser questions for an object', () => {
  it('recognises the Inform 6 and Inform 7 English questions that name no object', () => {
    expect(ask('What do you want to examine?')).toEqual({ options: [] });
    expect(ask('Whom do you want to talk to?')).toEqual({ options: [] });
    expect(ask('Who do you want to ask?')).toEqual({ options: [] });
    // An order to someone, and a missing second object.
    expect(ask('What do you want the sailor to take?')).toEqual({ options: [] });
    expect(ask('What do you want to put the paraffin can in?')).toEqual({ options: [] });
    expect(ask('Sorry, you can only have one item here. Which exactly?')).toEqual({ options: [] });
  });

  it('reads the last paragraph, with or without the prompt after it', () => {
    expect(ask('>examine', 'What do you want to examine?', '>')).toEqual({ options: [] });
    expect(ask('What do you want to examine? >')).toEqual({ options: [] });
    expect(ask('(first taking the lamp)\nWhat do you want to light it with?')).toEqual({
      options: [],
    });
  });

  it('recognises the French questions', () => {
    // Inform 6, Lionel Ange's library (no-break space before "?").
    expect(ask('Que voulez-vous prendre\u00a0?')).toEqual({ options: [] });
    expect(ask('Qui voulez-vous attaquer ?')).toEqual({ options: [] });
    expect(ask('À qui voulez-vous donner la pomme ?')).toEqual({ options: [] });
    expect(ask('Avec quoi voulez-vous ouvrir la porte ?')).toEqual({ options: [] });
    expect(ask("Désolé, vous ne pouvez avoir qu'un seul objet ici. Lequel exactement ?")).toEqual({
      options: [],
    });
    // Inform 6, Jean-Luc Pontico's library.
    expect(ask('Pouvez-vous préciser ?')).toEqual({ options: [] });
    expect(
      ask('Désolé, vous pouvez seulement avoir un objet ici. Lequel voulez-vous exactement ?'),
    ).toEqual({ options: [] });
    // Inform 7, French Language: in brackets.
    expect(ask('[Pouvez-vous préciser ce qui est concerné par cette action\u00a0?]')).toEqual({
      options: [],
    });
    // Some games say "tu".
    expect(ask('Que veux-tu prendre ?')).toEqual({ options: [] });
  });

  it('takes the options of a "Which do you mean" question, in order', () => {
    expect(ask('Which do you mean, the brass lamp or the oil lamp?')).toEqual({
      options: ['brass lamp', 'oil lamp'],
    });
    expect(ask('Which do you mean, the red ball, the blue ball or the green ball?')).toEqual({
      options: ['red ball', 'blue ball', 'green ball'],
    });
    expect(ask('Who do you mean, the sailor or the keeper?')).toEqual({
      options: ['sailor', 'keeper'],
    });
    expect(ask('Which do you mean, the red ball, the blue ball, or the green ball?')).toEqual({
      options: ['red ball', 'blue ball', 'green ball'],
    });
    expect(ask('Which do you mean, Bob or the bobbin?')).toEqual({ options: ['bob', 'bobbin'] });
  });

  it('takes the options of the French questions, without their articles', () => {
    // Inform 7 French Language (no-break spaces) and Pontico's Inform 6 library (no space before "?").
    expect(ask('Précisez\u00a0: la lampe de cuivre ou la lampe à huile\u00a0?')).toEqual({
      options: ['lampe de cuivre', 'lampe à huile'],
    });
    expect(ask("Précisez : le ciré jaune, le ciré noir ou l'ancre?")).toEqual({
      options: ['ciré jaune', 'ciré noir', 'ancre'],
    });
    // Lionel Ange's Inform 6 library.
    expect(ask('Voulez-vous dire le bouton rouge ou le bouton bleu ?')).toEqual({
      options: ['bouton rouge', 'bouton bleu'],
    });
  });

  it('leaves out articles, possessives and notes, and repeats', () => {
    expect(questionOptions('your coat or a coat (being worn)')).toEqual(['coat']);
    expect(questionOptions('an apple, some bread or my hat')).toEqual(['apple', 'bread', 'hat']);
    const many = Array.from({ length: MAX_OPTIONS + 3 }, (_, i) => 'the ball ' + i).join(', ');
    expect(questionOptions(many)).toHaveLength(MAX_OPTIONS);
  });

  it('does not take a question to the player, nor one inside the prose', () => {
    // Yes/no questions are answer chips (S1.17).
    expect(ask('Do you want to call the boat back?')).toBeNull();
    expect(ask('Voulez-vous recommencer ?')).toBeNull();
    expect(ask('Voulez-vous dire quelque chose ?')).toBeNull();
    // A character's question, in quotes or in a sentence.
    expect(ask('“What do you want?” the keeper asks.')).toBeNull();
    expect(ask('The keeper frowns. "Which do you mean, the boat or the bell?"')).toBeNull();
    // A parser question followed by more text is not the last paragraph.
    expect(ask('What do you want to examine?', 'The wind rises.')).toBeNull();
    expect(ask('A stone jetty at the foot of the lighthouse.')).toBeNull();
    expect(ask()).toBeNull();
  });
});
