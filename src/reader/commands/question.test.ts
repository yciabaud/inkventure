import { describe, expect, it } from 'vitest';
import { MAX_OPTIONS, parserQuestion, questionOptions } from './question';
import { verbTable } from './verbs';

const EN = verbTable('en');
const FR = verbTable('fr');
const ask = (...paragraphs: string[]) => parserQuestion(paragraphs, EN);
const demande = (...paragraphs: string[]) => parserQuestion(paragraphs, FR);

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
    expect(demande('Que voulez-vous prendre\u00a0?')).toEqual({ options: [] });
    expect(demande('Qui voulez-vous attaquer ?')).toEqual({ options: [] });
    expect(demande('À qui voulez-vous donner la pomme ?')).toEqual({ options: [] });
    expect(demande('Avec quoi voulez-vous ouvrir la porte ?')).toEqual({ options: [] });
    expect(
      demande("Désolé, vous ne pouvez avoir qu'un seul objet ici. Lequel exactement ?"),
    ).toEqual({
      options: [],
    });
    // Inform 6, Jean-Luc Pontico's library.
    expect(demande('Pouvez-vous préciser ?')).toEqual({ options: [] });
    // With the command it is about: the chips repeat it.
    expect(parserQuestion(['Pouvez-vous préciser ?'], FR, 'fouiller')).toEqual({
      options: [],
      repeat: 'fouiller',
    });
    expect(
      demande('Désolé, vous pouvez seulement avoir un objet ici. Lequel voulez-vous exactement ?'),
    ).toEqual({ options: [] });
    // Inform 7, French Language: in brackets.
    expect(demande('[Pouvez-vous préciser ce qui est concerné par cette action\u00a0?]')).toEqual({
      options: [],
    });
    // Some games say "tu".
    expect(demande('Que veux-tu prendre ?')).toEqual({ options: [] });
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
    expect(demande('Précisez\u00a0: la lampe de cuivre ou la lampe à huile\u00a0?')).toEqual({
      options: ['lampe de cuivre', 'lampe à huile'],
    });
    expect(demande("Précisez : le ciré jaune, le ciré noir ou l'ancre?")).toEqual({
      options: ['ciré jaune', 'ciré noir', 'ancre'],
    });
    // Lionel Ange's Inform 6 library.
    expect(demande('Voulez-vous dire le bouton rouge ou le bouton bleu ?')).toEqual({
      options: ['bouton rouge', 'bouton bleu'],
    });
  });

  it('leaves out articles, possessives and notes, and repeats', () => {
    expect(questionOptions('your coat or a coat (being worn)')).toEqual(['coat']);
    expect(questionOptions("le ciré ou l'ancre", 'fr')).toEqual(['ciré', 'ancre']);
    expect(questionOptions('an apple, some bread or my hat')).toEqual(['apple', 'bread', 'hat']);
    const many = Array.from({ length: MAX_OPTIONS + 3 }, (_, i) => 'the ball ' + i).join(', ');
    expect(questionOptions(many)).toHaveLength(MAX_OPTIONS);
  });

  it('does not take a question to the player, nor one inside the prose', () => {
    // Yes/no questions are answer chips (S1.17).
    expect(ask('Do you want to call the boat back?')).toBeNull();
    expect(demande('Voulez-vous recommencer ?')).toBeNull();
    expect(demande('Voulez-vous dire quelque chose ?')).toBeNull();
    // A character's question, in quotes or in a sentence.
    expect(ask('“What do you want?” the keeper asks.')).toBeNull();
    expect(ask('The keeper frowns. "Which do you mean, the boat or the bell?"')).toBeNull();
    // A parser question followed by more text is not the last paragraph.
    expect(ask('What do you want to examine?', 'The wind rises.')).toBeNull();
    expect(ask('A stone jetty at the foot of the lighthouse.')).toBeNull();
    expect(ask()).toBeNull();
  });
});

describe('parser questions without a known phrase', () => {
  const ES = verbTable('es');
  const DE = verbTable('de');

  it('takes a short list of objects sharing a word with the command, in any language', () => {
    // Spanish and German libraries the tables do not know.
    expect(
      parserQuestion(
        ['¿Cuál quieres decir, el abrigo rojo o el abrigo azul?'],
        ES,
        'examinar abrigo',
      ),
    ).toEqual({
      options: ['abrigo rojo', 'abrigo azul'],
    });
    expect(
      parserQuestion(
        ['Welchen meinst du, den roten Mantel, den blauen Mantel oder den alten Mantel?'],
        DE,
        'untersuche mantel',
      ),
    ).toEqual({ options: ['roten mantel', 'blauen mantel', 'alten mantel'] });
    // An English wording other than the library's.
    expect(parserQuestion(['The yellow oilskin or the black oilskin?'], EN, 'x oilskin')).toEqual({
      options: ['yellow oilskin', 'black oilskin'],
    });
  });

  it('takes a short question after a verb of the bar sent alone, and repeats the verb', () => {
    expect(parserQuestion(['¿Qué quieres examinar?'], ES, 'examinar')).toEqual({
      options: [],
      repeat: 'examinar',
    });
    expect(parserQuestion(['Was willst du untersuchen?', '>'], DE, 'untersuche')).toEqual({
      options: [],
      repeat: 'untersuche',
    });
  });

  it('leaves out other questions', () => {
    // A command that is not a verb alone, and no list sharing its words.
    expect(parserQuestion(['Wohin?'], DE, 'gehe')).toBeNull();
    expect(parserQuestion(['The keeper or the sailor?'], EN, 'x oilskin')).toBeNull();
    // A yes/no question after a verb.
    expect(parserQuestion(['Are you sure you want to take it?'], EN, 'take')).toBeNull();
    // More text than the question, or none sent.
    expect(parserQuestion(['You look around.', 'Which one?'], EN, 'examine')).toBeNull();
    expect(parserQuestion(['Which one?'], EN)).toBeNull();
    // A list in the prose that does not end with a question.
    expect(
      parserQuestion(['The red coat, the blue coat or the old coat.'], EN, 'x coat'),
    ).toBeNull();
  });
});
