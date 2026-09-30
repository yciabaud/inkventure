// Ink engine: compiled ink stories (JSON) played by inkjs (inkle / Yannick Lohse, MIT). This module is its own lazy
// chunk: only the reader of an ink game loads it. Choice-based: every stop asks for a choice (`ChoiceInput`).
import { strFromU8, strToU8 } from 'fflate';
import { Story } from 'inkjs';
import type { Engine, InputRequest, OutputBlock } from '../engine';

/** Marks our saved states: format and version of the envelope around the ink state. */
const FORMAT = 'inkventure-ink';
const VERSION = 1;

/** inkjs `ErrorType.Error` (the enum is not exported by the runtime bundle): authoring errors and warnings are not fatal. */
const ERROR = 2;

interface Envelope {
  format: string;
  version: number;
  /** The story it belongs to: a hash of its JSON. */
  signature: string;
  /** `story.state.toJson()`. */
  state: string;
  /** The chapter shown in the status line at that point. */
  chapter: string;
}

/** A 32-bit hash of the story text and its length, in hex: tells a save of another story apart. */
function signatureOf(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16) + '-' + text.length.toString(16);
}

function storyText(story: ArrayBuffer | string): string {
  const text = typeof story === 'string' ? story : strFromU8(new Uint8Array(story));
  // inklecate writes a byte order mark.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** `key: value` tags (ink's convention for metadata), key in lower case. */
function tagValue(tags: string[] | null, key: string): string | null {
  if (!tags) return null;
  for (let i = 0; i < tags.length; i++) {
    const match = /^\s*([^:]+?)\s*:\s*(.*?)\s*$/.exec(tags[i]);
    if (match && match[1].toLowerCase() === key) return match[2];
  }
  return null;
}

export function createInkEngine(): Engine {
  let story: Story | null = null;
  let signature = '';
  let title = '';
  let chapter = '';
  // Choices offered: the story waits for one.
  let choices: string[] | null = null;
  let output: (blocks: OutputBlock[]) => void = () => undefined;
  let inputRequest: (req: InputRequest) => void = () => undefined;
  let exit: () => void = () => undefined;
  let error: (message: string) => void = () => undefined;
  // Errors reported by inkjs during the current step.
  let errors: string[] = [];

  function statusBlock(): OutputBlock {
    // Title on the left, chapter on the right (the reader splits the line at a run of spaces).
    const left = title || chapter;
    const right = title ? chapter : '';
    return { type: 'status', lines: [right ? left + '   ' + right : left] };
  }

  /** Continues the story until it stops: at choices (asks for one) or at its end. */
  function run(blocks: OutputBlock[]): void {
    const current = story as Story;
    choices = null;
    try {
      while (current.canContinue && !errors.length) {
        const text = current.Continue() || '';
        const next = tagValue(current.currentTags, 'chapter');
        if (next !== null && next !== chapter) {
          chapter = next;
          blocks.push(statusBlock());
        }
        const line = text.replace(/\s+$/, '');
        if (line) blocks.push({ type: 'paragraph', runs: [{ text: line, style: 'normal' }] });
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    if (blocks.length) output(blocks);
    if (errors.length) {
      const message = errors.join('\n');
      errors = [];
      error(message);
      return;
    }
    const offered = current.currentChoices;
    if (offered.length) {
      choices = offered.map((choice) => choice.text);
      inputRequest({ type: 'choice', choices: choices.slice(0) });
    } else {
      exit();
    }
  }

  function begin(): void {
    chapter = '';
    run(title ? [statusBlock()] : []);
  }

  return {
    kind: 'ink',

    load(data: ArrayBuffer | string): Promise<void> {
      try {
        const text = storyText(data);
        const created = new Story(text);
        created.allowExternalFunctionFallbacks = true;
        created.onError = (message, type) => {
          if (type === ERROR) errors.push(message);
          else console.warn('ink: ' + message);
        };
        story = created;
        signature = signatureOf(text);
        title = tagValue(created.globalTags, 'title') || '';
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
      begin();
      return Promise.resolve();
    },

    onOutput(cb) {
      output = cb;
    },
    onInputRequest(cb) {
      inputRequest = cb;
    },
    onExit(cb) {
      exit = cb;
    },
    onError(cb) {
      error = cb;
    },

    // A choice game takes no typed commands nor keys.
    sendLine() {},
    sendChar() {},

    choose(index: number) {
      if (!story || !choices || index < 0 || index >= choices.length) return;
      // The choice made stands in the transcript like an echoed command.
      const blocks: OutputBlock[] = [
        { type: 'paragraph', runs: [{ text: choices[index], style: 'input' }] },
      ];
      choices = null;
      try {
        story.ChooseChoiceIndex(index);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
      run(blocks);
    },

    saveState(): Promise<Uint8Array> {
      if (!story || !choices) return Promise.reject(new Error('Not between turns'));
      const envelope: Envelope = {
        format: FORMAT,
        version: VERSION,
        signature: signature,
        state: story.state.toJson(),
        chapter: chapter,
      };
      return Promise.resolve(strToU8(JSON.stringify(envelope)));
    },

    restoreState(data: Uint8Array): Promise<void> {
      if (!story) return Promise.reject(new Error('No story'));
      let envelope: Envelope;
      try {
        envelope = JSON.parse(strFromU8(data)) as Envelope;
      } catch {
        return Promise.reject(new Error('Not a saved state'));
      }
      if (!envelope || envelope.format !== FORMAT || envelope.version !== VERSION) {
        return Promise.reject(new Error('Not a saved state'));
      }
      if (envelope.signature !== signature) {
        return Promise.reject(new Error('A saved state of another story'));
      }
      const previous = story.state.toJson();
      try {
        story.state.LoadJson(envelope.state);
      } catch (e) {
        story.state.LoadJson(previous);
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
      chapter = envelope.chapter || '';
      // Its text is not replayed (the reader keeps its own transcript): only the choices are asked for again.
      run([]);
      return Promise.resolve();
    },

    restart(): Promise<void> {
      if (!story) return Promise.reject(new Error('No story'));
      story.ResetState();
      begin();
      return Promise.resolve();
    },

    // The reader goes back to its previous turn snapshot (an ink state).
    undo(): Promise<boolean> {
      return Promise.resolve(false);
    },
  };
}
