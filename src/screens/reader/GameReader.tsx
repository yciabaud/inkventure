import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { reportTiming } from '../../app/perf';
import type { Engine, EngineKind, InputRequest, OutputBlock } from '../../engines/engine';
import { loadEngine } from '../../engines/formats';
import {
  applyOutput,
  EMPTY_TRANSCRIPT,
  splitStatus,
  statusRows,
  type StatusRow,
  type Transcript,
} from '../../engines/transcript';
import { t } from '../../i18n/i18n';
import type { GameSnapshot, SlotInfo } from '../../storage/saves';
import { addToHome, getStore, isStorageFullError } from '../../storage';
import { findAnswers } from '../../reader/commands/answers';
import { applyNoun } from '../../reader/commands/compose';
import { findKeys, type KeyPrompt } from '../../reader/keys';
import { recentNouns } from '../../reader/commands/nouns';
import { verbTable } from '../../reader/commands/verbs';
import { lastScreenStart, readerBlocks } from '../../reader/fromTranscript';
import { settingsKey, textStyle } from '../../reader/settings';
import { PagedText } from '../../reader/PagedText';
import { UndoStack } from '../../reader/undoStack';
import { wordAt } from '../../reader/wordAt';
import { ErrorPage } from '../../ui/ErrorPage';
import { choicesHeight, ChoiceList } from './ChoiceList';
import { COMMAND_BAR_HEIGHT, CommandBar } from './CommandBar';
import { KeyBar } from './KeyBar';
import { ReaderFrame } from './ReaderFrame';
import { TranscriptNav } from './TranscriptNav';
import { RestartDialog, RestoreDialog, SaveDialog, type SaveMessage } from './SaveDialogs';
/** Chips follow the game's language; English when the catalogue does not know it. */
const DEFAULT_LANGUAGE = 'en';

/** Paragraphs scanned for noun chips: the latest turns only. */
const NOUN_PARAGRAPHS = 12;

/** Paragraphs scanned for the answers to a question the game asks: the latest ones since the last command. */
const ANSWER_PARAGRAPHS = 12;

/** Paragraphs scanned for the keys a single-key prompt names: the latest ones since the last command. */
const KEY_PARAGRAPHS = 12;

const NO_KEYS: KeyPrompt = { keys: [], space: false };

// Status line width, in characters, asked of the game.
const COLUMNS = 80;

/** Glk key name for a keyboard event, or null for keys the game should not get (modifiers alone). */
function glkKey(event: KeyboardEvent): string | null {
  const names: Record<string, string> = {
    Enter: 'return',
    Escape: 'escape',
    Esc: 'escape',
    Backspace: 'delete',
    Delete: 'delete',
    Tab: 'tab',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    PageUp: 'pageup',
    PageDown: 'pagedown',
    Home: 'home',
    End: 'end',
  };
  if (names[event.key]) return names[event.key];
  return event.key && event.key.length === 1 ? event.key : null;
}

type SavesModule = typeof import('../../storage/saves');

/** The game at the start of a turn: engine state, turn number and the transcript up to there. */
interface TurnState {
  state: Uint8Array;
  turn: number;
  transcript: Transcript;
}

/** The snapshot of a turn: the transcript without the screens replaced by later ones, and where screens start. */
function toGameSnapshot(turnState: TurnState): GameSnapshot {
  const paragraphs: GameSnapshot['paragraphs'] = [];
  const screens: number[] = [];
  const all = turnState.transcript.paragraphs;
  for (let i = 0; i < all.length; i++) {
    if (all[i].replaced) continue;
    if (all[i].screen) screens.push(paragraphs.length);
    paragraphs.push(all[i].image || all[i].runs);
  }
  const snapshot: GameSnapshot = {
    state: turnState.state,
    turn: turnState.turn,
    paragraphs: paragraphs,
    status: turnState.transcript.status,
  };
  if (screens.length) snapshot.screens = screens;
  return snapshot;
}

function fromGameSnapshot(saved: GameSnapshot): TurnState {
  const screens: Record<number, boolean> = {};
  if (saved.screens)
    for (let i = 0; i < saved.screens.length; i++) screens[saved.screens[i]] = true;
  const blocks: OutputBlock[] = [];
  saved.paragraphs.forEach((paragraph, i) => {
    if (screens[i]) blocks.push({ type: 'clear' });
    blocks.push(
      Array.isArray(paragraph)
        ? { type: 'paragraph', runs: paragraph }
        : { type: 'image', ...paragraph },
    );
  });
  blocks.push({ type: 'status', lines: saved.status });
  return {
    state: saved.state,
    turn: saved.turn,
    transcript: applyOutput(EMPTY_TRANSCRIPT, blocks),
  };
}

/**
 * The block the pages open on after going back in time: the last command, or the screen the game cleared its window
 * for after it, so the last page is shown.
 */
function lastTurnFocus(transcript: Transcript): number {
  const blocks = readerBlocks(transcript.paragraphs, true);
  let command = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].kind === 'input') {
      command = i;
      break;
    }
  }
  return Math.max(command, lastScreenStart(blocks));
}

type Dialogs = 'save' | 'restore' | 'restart' | null;

/** The game, or the Transcript view (the whole session, read-only). */
type View = 'game' | 'transcript';

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'playing' }
  | { phase: 'ended' };

interface Props {
  tuid: string;
  /** Shown in the top zone until the game draws its status line. */
  title: string;
  /** For My adventures, where the game is added on its first turn. */
  author?: string;
  /** IFDB has cover art for it. */
  cover?: boolean;
  /** The game's language, for the command chips. */
  language?: string;
  kind: EngineKind;
  /** The story file. */
  story: Uint8Array;
  /** Show how long the last turn took, in the status line (`?perf=1`: measuring engines on a device). */
  perf?: boolean;
}

/** A game in the reader: the engine of its format runs `story`; the session is autosaved under `tuid`. */
export function GameReader({ tuid, title, author, cover, language, kind, story, perf }: Props) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [transcript, setTranscript] = useState<Transcript>(EMPTY_TRANSCRIPT);
  const [request, setRequest] = useState<InputRequest | null>(null);
  // Block the pages open on when new text arrives: the start of the new turn.
  const [focus, setFocus] = useState(0);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  // The command field has focus: stay on the last page when the virtual keyboard resizes it.
  const [typing, setTyping] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  // When the input that started the running turn was sent, and how long the last turn took (ms).
  const turnStartRef = useRef<number | null>(null);
  // Number of paragraphs when the last key was sent: a menu redrawn after it is read from there.
  const keyMarkRef = useRef(-1);
  // Screens started when the last input was sent: a screen started since then is where the pages open (S1.16).
  const screensAtSendRef = useRef(0);
  const [turnTime, setTurnTime] = useState<number | null>(null);

  /** The game waits for input again (or has ended): the running turn is over. */
  function turnEnded() {
    const start = turnStartRef.current;
    turnStartRef.current = null;
    if (start === null || !perf) return;
    const time = Date.now() - start;
    setTurnTime(time);
    // Also in the timings line (S7.1), which logs it to the console.
    reportTiming('turn', time);
  }
  const table = useMemo(() => verbTable(language || DEFAULT_LANGUAGE), [language]);

  // The session outside React state, so snapshots read it as the engine is (not as last rendered).
  const transcriptRef = useRef<Transcript>(EMPTY_TRANSCRIPT);
  const turnRef = useRef(0);
  // Added to My adventures (once per session: a game removed from Home comes back when played again).
  const addedRef = useRef(false);
  const savesRef = useRef<SavesModule | null>(null);
  const [undoStack] = useState(() => new UndoStack<TurnState>());
  // Input requests while restoring a state do not start a new turn.
  const restoringRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [view, setView] = useState<View>('game');
  const [message, setMessage] = useState<SaveMessage>(null);
  const [slots, setSlots] = useState<Array<SlotInfo | null>>([]);
  // Name proposed in the Save dialog: the location, else the turn.
  const [saveName, setSaveName] = useState('');

  function showTranscript(next: Transcript) {
    transcriptRef.current = next;
    setTranscript(next);
  }

  /** Autosave (the last turn on disk) and the progress record for Home. Storage full: the StorageNotice says so. */
  function persist(turnState: TurnState) {
    const saves = savesRef.current;
    if (!saves) return;
    const store = getStore();
    const now = Date.now();
    try {
      if (!addedRef.current) {
        addToHome(store, { tuid: tuid, title: title, author: author || '', cover: cover }, now);
        addedRef.current = true;
      }
      saves.updateProgress(store, tuid, {
        turns: turnState.turn,
        lastPlayed: now,
        location: splitStatus(turnState.transcript.status).left,
      });
      saves.writeAutosave(store, tuid, toGameSnapshot(turnState), now);
    } catch (error) {
      if (!isStorageFullError(error)) console.error('Autosave failed', error);
    }
  }

  /** A new turn begins (the game waits for a command): snapshot it for Undo and autosave it. */
  function snapshotTurn(engine: Engine) {
    // After the page has drawn the reply: saving is the slowest part of a turn on an e-reader.
    setTimeout(() => {
      if (engineRef.current !== engine) return;
      const turn = turnRef.current;
      const transcript = transcriptRef.current;
      engine.saveState().then(
        (state) => {
          if (engineRef.current !== engine) return;
          const turnState = { state: state, turn: turn, transcript: transcript };
          undoStack.push(turnState);
          setCanUndo(undoStack.canUndo);
          persist(turnState);
        },
        () => undefined, // no longer between turns (a key is expected, or the story ended)
      );
    }, 0);
  }

  /** Continues from `turnState` (resume, restore, undo). Rejects, leaving the game as it was, when it cannot. */
  function restore(engine: Engine, turnState: TurnState): Promise<void> {
    restoringRef.current = true;
    keyMarkRef.current = -1;
    return engine.restoreState(turnState.state).then(
      () => {
        restoringRef.current = false;
        turnRef.current = turnState.turn;
        showTranscript(turnState.transcript);
        screensAtSendRef.current = turnState.transcript.screens;
        setFocus(lastTurnFocus(turnState.transcript));
        setState({ phase: 'playing' });
      },
      (error) => {
        restoringRef.current = false;
        throw error;
      },
    );
  }

  const snapshotRef = useRef(snapshotTurn);
  useEffect(() => {
    snapshotRef.current = snapshotTurn;
  });

  useEffect(() => {
    let cancelled = false;
    // The engine and the saves are lazy chunks.
    Promise.all([loadEngine(kind), import('../../storage/saves')])
      .then(([createEngine, saves]) => {
        if (cancelled) return;
        savesRef.current = saves;
        const engine = createEngine();
        engineRef.current = engine;
        engine.onOutput((blocks) => showTranscript(applyOutput(transcriptRef.current, blocks)));
        engine.onInputRequest((req) => {
          turnEnded();
          setRequest(req);
          // A turn begins at a command or a choice (not at a key prompt).
          if (req.type !== 'char' && !restoringRef.current) snapshotRef.current(engine);
        });
        engine.onExit(() => {
          turnEnded();
          setRequest(null);
          setState({ phase: 'ended' });
        });
        engine.onError((message) => {
          setRequest(null);
          setState({ phase: 'failed', message: t('reader.engineError', { message: message }) });
        });
        // The engine keeps the buffer: give it a copy that is exactly the story.
        const data = story.buffer.slice(story.byteOffset, story.byteOffset + story.byteLength);
        return engine.load(data as ArrayBuffer, { columns: COLUMNS }).then(() => {
          // Resume from the autosave; if it does not restore, the story starts afresh.
          const saved = saves.readAutosave(getStore(), tuid);
          if (!saved || cancelled) return;
          const turnState = fromGameSnapshot(saved);
          return restore(engine, turnState).then(
            () => {
              undoStack.reset(turnState);
              setCanUndo(false);
            },
            () => undefined,
          );
        });
      })
      .then(() => {
        if (!cancelled) setState((s) => (s.phase === 'loading' ? { phase: 'playing' } : s));
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'failed', message: t('reader.gameLoadFailed') });
      });
    return () => {
      cancelled = true;
      engineRef.current = null;
    };
    // Mount only: the callbacks read the session through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openSlots(which: 'save' | 'restore') {
    const saves = savesRef.current;
    if (!saves) return;
    setSlots(saves.listSlots(getStore(), tuid));
    setSaveName(
      splitStatus(transcriptRef.current.status).left ||
        t('saves.defaultName', { turn: turnRef.current }),
    );
    setMessage(null);
    setDialog(which);
  }

  function saveSlot(slot: number, name: string) {
    const engine = engineRef.current;
    const saves = savesRef.current;
    if (!engine || !saves) return;
    const turn = turnRef.current;
    const transcript = transcriptRef.current;
    engine
      .saveState()
      .then((state) => {
        const store = getStore();
        const snapshot = toGameSnapshot({ state: state, turn: turn, transcript: transcript });
        saves.writeSlot(store, tuid, slot, name, snapshot, Date.now());
        setSlots(saves.listSlots(store, tuid));
        setMessage({ kind: 'done', text: t('saves.saved', { slot: slot }) });
      })
      .catch((error) => {
        setMessage({
          kind: 'error',
          text: isStorageFullError(error) ? t('saves.full') : t('saves.failed'),
        });
      });
  }

  function restoreSlot(slot: number) {
    const engine = engineRef.current;
    const saves = savesRef.current;
    if (!engine || !saves) return;
    const saved = saves.readSlot(getStore(), tuid, slot);
    const failed = () => setMessage({ kind: 'error', text: t('saves.restoreFailed') });
    if (!saved) {
      failed();
      return;
    }
    const turnState = fromGameSnapshot(saved);
    restore(engine, turnState).then(() => {
      // Earlier turns belong to another timeline: Undo starts again from here.
      undoStack.reset(turnState);
      setCanUndo(false);
      persist(turnState);
      setDialog(null);
    }, failed);
  }

  function undo() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.undo().then((done) => {
      if (done) return;
      // The engine cannot: go back to the previous turn's snapshot.
      const previous = undoStack.undo();
      setCanUndo(undoStack.canUndo);
      if (!previous) return;
      restore(engine, previous).then(
        () => persist(previous),
        () => undefined,
      );
    });
  }

  function restart() {
    const engine = engineRef.current;
    const saves = savesRef.current;
    setDialog(null);
    if (!engine) return;
    setView('game');
    turnRef.current = 0;
    keyMarkRef.current = -1;
    screensAtSendRef.current = 0;
    undoStack.reset();
    setCanUndo(false);
    setFocus(0);
    setRequest(null);
    showTranscript(EMPTY_TRANSCRIPT);
    if (saves) saves.clearAutosave(getStore(), tuid);
    setState({ phase: 'playing' });
    engine
      .restart()
      .catch(() => setState({ phase: 'failed', message: t('reader.gameLoadFailed') }));
  }

  const awaitingLine = request !== null && request.type === 'line';
  const awaitingChar = request !== null && request.type === 'char';
  const awaitingChoice = request !== null && request.type === 'choice';
  // Height of the choice list under the text, as last measured.
  const [choiceHeight, setChoiceHeight] = useState(0);
  const blocks = useMemo(
    () => readerBlocks(transcript.paragraphs, awaitingLine),
    [transcript, awaitingLine],
  );
  // The Transcript view also shows the screens replaced by later ones (menu screens, intro pages).
  const transcriptBlocks = useMemo(
    () => (view === 'transcript' ? readerBlocks(transcript.paragraphs, awaitingLine, true) : []),
    [transcript, awaitingLine, view],
  );
  // A screen started since the last input (the game cleared its window): the pages open on it, so a menu redrawn after
  // a key shows at once. Otherwise on the start of the turn.
  const openAt = useMemo(() => {
    if (transcript.screens <= screensAtSendRef.current) return focus;
    const start = lastScreenStart(blocks);
    return start >= 0 ? start : focus;
  }, [blocks, transcript.screens, focus]);
  const nouns = useMemo(() => {
    const texts: string[] = [];
    for (let i = Math.max(0, blocks.length - NOUN_PARAGRAPHS); i < blocks.length; i++) {
      if (blocks[i].kind === 'text') texts.push(blocks[i].text);
    }
    return recentNouns(texts, table, splitStatus(transcript.status).left);
  }, [blocks, table, transcript.status]);

  // The answers to a question the game asks before the prompt (Yes / No, numbered options), from the text since the
  // last command.
  const answers = useMemo(() => {
    if (!awaitingLine) return [];
    const paragraphs = transcript.paragraphs;
    const texts: string[] = [];
    for (let i = paragraphs.length - 1; i >= 0 && texts.length < ANSWER_PARAGRAPHS; i--) {
      if (paragraphs[i].replaced) continue;
      // The last command's echo ends the search.
      if (paragraphs[i].input) break;
      if (paragraphs[i].text.trim()) texts.unshift(paragraphs[i].text);
    }
    return findAnswers(texts, table.language);
  }, [transcript, awaitingLine, table]);

  // The keys a single-key prompt names, in every status row and in the text since the last command. When the game printed
  // keys after the last key sent (a new screen of a menu), only those: a "Press any key" that follows a menu does not.
  const keyPrompt = useMemo(() => {
    if (!awaitingChar) return NO_KEYS;
    const paragraphs = transcript.paragraphs;
    let start = paragraphs.length;
    while (start > 0 && !paragraphs[start - 1].input && paragraphs.length - start < KEY_PARAGRAPHS)
      start--;
    const texts = (from: number) =>
      paragraphs
        .slice(from)
        .filter((p) => !p.replaced)
        .map((p) => p.text);
    const mark = keyMarkRef.current;
    if (mark > start && mark < paragraphs.length) {
      const recent = findKeys(texts(mark), transcript.status);
      if (recent.keys.length) return recent;
    }
    return findKeys(texts(start), transcript.status);
  }, [transcript, awaitingChar]);

  /** The data of a picture of the story (Glulx), from the engine. */
  function imageUrl(id: number): string | null {
    const engine = engineRef.current;
    return engine && engine.imageUrl ? engine.imageUrl(id) : null;
  }

  function sendChar(key: string) {
    const engine = engineRef.current;
    if (!engine || !awaitingChar) return;
    setFocus(blocks.length);
    setRequest(null);
    keyMarkRef.current = transcriptRef.current.paragraphs.length;
    screensAtSendRef.current = transcriptRef.current.screens;
    turnStartRef.current = Date.now();
    engine.sendChar(key);
  }

  function sendLine(text: string) {
    const engine = engineRef.current;
    if (!engine || !awaitingLine) return;
    // The hidden prompt comes back with the command echoed after it: the new turn opens there.
    setFocus(blocks.length);
    setRequest(null);
    setCommand('');
    if (text.trim()) setHistory((current) => current.concat(text.trim()));
    turnRef.current++;
    screensAtSendRef.current = transcriptRef.current.screens;
    turnStartRef.current = Date.now();
    engine.sendLine(text);
  }

  function choose(index: number) {
    const engine = engineRef.current;
    if (!engine || !awaitingChoice) return;
    // The choice made is echoed: the new turn opens there.
    setFocus(blocks.length);
    setRequest(null);
    turnRef.current++;
    screensAtSendRef.current = transcriptRef.current.screens;
    turnStartRef.current = Date.now();
    engine.choose(index);
  }

  // Keys go to the game while it waits for one (outside text fields).
  const sendCharRef = useRef(sendChar);
  useEffect(() => {
    sendCharRef.current = sendChar;
  });
  useEffect(() => {
    if (!awaitingChar) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = glkKey(event);
      if (!key) return;
      // Capture phase, before the page turner: the key is the game's.
      event.preventDefault();
      event.stopPropagation();
      sendCharRef.current(key);
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [awaitingChar]);

  if (state.phase === 'failed') return <ErrorPage message={state.message} />;

  const status = statusRows(transcript.status);
  const time =
    perf && turnTime !== null ? (
      <span class="reader__score">{t('reader.turnTime', { ms: turnTime })}</span>
    ) : null;
  const heading =
    view === 'transcript' ? (
      <span class="reader__title">{t('transcript.title')}</span>
    ) : status.shown.length ? (
      <span class="reader__rows">
        {status.shown.map((row, i) => (
          <StatusLine key={i} row={row} first={i === 0}>
            {i === 0 && time}
          </StatusLine>
        ))}
        {status.overflow && <span class="reader__more">…</span>}
      </span>
    ) : time ? (
      <span class="reader__status">
        <span class="reader__title">{title}</span>
        {time}
      </span>
    ) : (
      <span class="reader__title">{title}</span>
    );
  // Rows past the top zone's cap are read in the menu, with the others.
  const menuNote =
    view === 'game' && status.overflow ? (
      <div class="reader__status-all" role="group" aria-label={t('reader.statusWindow')}>
        {status.all.map((row, i) => (
          <StatusLine key={i} row={row} first={i === 0} />
        ))}
      </div>
    ) : null;

  let slot = null;
  if (state.phase === 'ended') {
    slot = <p class="reader__input-slot">{t('reader.ended')}</p>;
  } else if (awaitingChar) {
    slot = <KeyBar prompt={keyPrompt} onKey={sendChar} onFocusChange={setTyping} />;
  } else if (state.phase === 'playing' && !request) {
    // A long turn (a slow Glulx game on an e-reader): the VM yields between slices, so this gets drawn.
    slot = <p class="reader__input-slot">{t('reader.working')}</p>;
  } else if (awaitingChoice) {
    slot = <ChoiceList choices={request.choices} onChoose={choose} onHeight={setChoiceHeight} />;
  } else if (awaitingLine) {
    slot = (
      <CommandBar
        table={table}
        nouns={nouns}
        answers={answers}
        field={command}
        onField={setCommand}
        onSend={sendLine}
        history={history}
        maxLength={request.maxlen}
        onFocusChange={setTyping}
      />
    );
  }

  const dialogs =
    dialog === 'save' ? (
      <SaveDialog
        slots={slots}
        defaultName={saveName}
        message={message}
        onSave={saveSlot}
        onClose={() => setDialog(null)}
      />
    ) : dialog === 'restore' ? (
      <RestoreDialog
        slots={slots}
        message={message}
        onRestore={restoreSlot}
        onClose={() => setDialog(null)}
      />
    ) : dialog === 'restart' ? (
      <RestartDialog onConfirm={restart} onClose={() => setDialog(null)} />
    ) : null;

  return (
    <>
      <ReaderFrame
        tuid={tuid}
        heading={heading}
        menuNote={menuNote}
        actions={
          state.phase === 'loading'
            ? []
            : [
                {
                  label: t('reader.save'),
                  onSelect: () => openSlots('save'),
                  disabled: !awaitingLine && !awaitingChoice,
                },
                { label: t('reader.restore'), onSelect: () => openSlots('restore') },
                { label: t('reader.undo'), onSelect: undo, disabled: !canUndo },
                { label: t('reader.restart'), onSelect: () => setDialog('restart') },
                view === 'transcript'
                  ? { label: t('transcript.close'), onSelect: () => setView('game') }
                  : {
                      label: t('reader.transcript'),
                      onSelect: () => {
                        setTyping(false);
                        setView('transcript');
                      },
                    },
              ]
        }
      >
        {(closeBar, settings) =>
          state.phase === 'loading' ? (
            <p class="reader__loading ui-font">{t('reader.loading')}</p>
          ) : view === 'transcript' ? (
            <PagedText
              key="transcript"
              blocks={transcriptBlocks}
              // Opens on the last page: the latest turns.
              focus={transcriptBlocks.length}
              textStyle={textStyle(settings)}
              layoutKey={settingsKey(settings)}
              imageUrl={imageUrl}
              interceptTap={closeBar}
              pageSlot={(nav) => <TranscriptNav nav={nav} onClose={() => setView('game')} />}
            />
          ) : (
            <PagedText
              key="game"
              blocks={blocks}
              focus={openAt}
              lastPageSlot={slot}
              lastSlotHeight={
                kind === 'ink'
                  ? choiceHeight || choicesHeight(awaitingChoice ? request.choices.length : 1)
                  : COMMAND_BAR_HEIGHT
              }
              textStyle={textStyle(settings)}
              layoutKey={settingsKey(settings)}
              frameKey={status.shown.length + (status.overflow ? '+' : '')}
              imageUrl={imageUrl}
              pinToLast={typing}
              interceptTap={(isLastPage, point) => {
                if (closeBar()) return true;
                // A tapped word of the story goes to the command field (or completes "take …").
                if (awaitingLine && isLastPage && point) {
                  const root = document.querySelector('.reader__text');
                  const word = root && wordAt(root, point.x, point.y);
                  if (word) {
                    const action = applyNoun(command, word, table.verbs);
                    if ('send' in action) sendLine(action.send);
                    else setCommand(action.field);
                    return true;
                  }
                }
                // "Press any key" / [MORE]: a tap on the last page answers it, unless the game names its keys.
                if (awaitingChar && isLastPage && !keyPrompt.keys.length) {
                  sendChar(keyPrompt.space ? ' ' : 'return');
                  return true;
                }
                return false;
              }}
            />
          )
        }
      </ReaderFrame>
      {dialogs}
    </>
  );
}

/** One row of the status window: its left part (the location on the first row) and its right part. */
function StatusLine({
  row,
  first,
  children,
}: {
  row: StatusRow;
  first: boolean;
  children?: ComponentChildren;
}) {
  return (
    <span class="reader__status">
      <span class={first ? 'reader__title' : 'reader__row'}>{row.left}</span>
      {row.right && <span class="reader__score">{row.right}</span>}
      {children}
    </span>
  );
}
