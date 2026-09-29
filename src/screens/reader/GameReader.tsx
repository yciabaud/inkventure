import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Engine, InputRequest } from '../../engines/engine';
import {
  applyOutput,
  EMPTY_TRANSCRIPT,
  splitStatus,
  type Transcript,
} from '../../engines/transcript';
import { t } from '../../i18n/i18n';
import { readerBlocks } from '../../reader/fromTranscript';
import { PagedText } from '../../reader/PagedText';
import { ErrorPage } from '../../ui/ErrorPage';
import { ReaderFrame } from './ReaderFrame';
// The fixture game (tests/fixtures/zmachine), served with the app for `#/play/fixture-z`.
import fixtureZUrl from '../../../tests/fixtures/zmachine/lamp.z5?url';

/** `#/play/fixture-z`: the bundled Z-machine fixture game, until real games are downloaded (S3.4). */
export const FIXTURE_Z_TUID = 'fixture-z';
const FIXTURE_Z_TITLE = 'The Lamp at Saltmere';

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

type State =
  | { phase: 'loading' }
  | { phase: 'failed'; message: string }
  | { phase: 'playing' }
  | { phase: 'ended' };

export function GameReader() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [transcript, setTranscript] = useState<Transcript>(EMPTY_TRANSCRIPT);
  const [request, setRequest] = useState<InputRequest | null>(null);
  // Block the pages open on when new text arrives: the start of the new turn.
  const [focus, setFocus] = useState(0);
  const [command, setCommand] = useState('');
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The engine is its own lazy chunk; the story file is fetched alongside it.
    const story = fetch(fixtureZUrl).then((response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.arrayBuffer();
    });
    Promise.all([import('../../engines/zvm/zvmEngine'), story])
      .then(([module, data]) => {
        if (cancelled) return;
        const engine = module.createZvmEngine();
        engineRef.current = engine;
        engine.onOutput((blocks) => setTranscript((current) => applyOutput(current, blocks)));
        engine.onInputRequest((req) => setRequest(req));
        engine.onExit(() => {
          setRequest(null);
          setState({ phase: 'ended' });
        });
        engine.onError((message) => {
          setRequest(null);
          setState({ phase: 'failed', message: t('reader.engineError', { message: message }) });
        });
        setState({ phase: 'playing' });
        return engine.load(data, { columns: COLUMNS });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'failed', message: t('reader.gameLoadFailed') });
      });
    return () => {
      cancelled = true;
      engineRef.current = null;
    };
  }, []);

  const awaitingLine = request !== null && request.type === 'line';
  const awaitingChar = request !== null && request.type === 'char';
  const blocks = useMemo(
    () => readerBlocks(transcript.paragraphs, awaitingLine),
    [transcript, awaitingLine],
  );

  function sendChar(key: string) {
    const engine = engineRef.current;
    if (!engine || !awaitingChar) return;
    setFocus(blocks.length);
    setRequest(null);
    engine.sendChar(key);
  }

  function sendLine(text: string) {
    const engine = engineRef.current;
    if (!engine || !awaitingLine) return;
    // The hidden prompt comes back with the command echoed after it: the new turn opens there.
    setFocus(blocks.length);
    setRequest(null);
    setCommand('');
    engine.sendLine(text);
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

  const status = splitStatus(transcript.status);
  const heading = status.left ? (
    <span class="reader__status">
      <span class="reader__title">{status.left}</span>
      {status.right && <span class="reader__score">{status.right}</span>}
    </span>
  ) : (
    <span class="reader__title">{FIXTURE_Z_TITLE}</span>
  );

  let slot = null;
  if (state.phase === 'ended') {
    slot = <p class="reader__input-slot">{t('reader.ended')}</p>;
  } else if (awaitingChar) {
    slot = (
      <button type="button" class="reader__present" onClick={() => sendChar('return')}>
        {t('reader.continue')} ›
      </button>
    );
  } else if (awaitingLine) {
    slot = (
      <form
        class="command"
        onSubmit={(event) => {
          event.preventDefault();
          sendLine(command);
        }}
      >
        <span class="command__prompt" aria-hidden="true">
          &gt;
        </span>
        <input
          class="command__input"
          type="text"
          value={command}
          onInput={(event) => setCommand((event.target as HTMLInputElement).value)}
          aria-label={t('reader.command')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellcheck={false}
          maxLength={request.maxlen}
        />
        <button type="submit" class="command__send">
          {t('reader.send')}
        </button>
      </form>
    );
  }

  return (
    <ReaderFrame heading={heading}>
      {(closeBar) =>
        state.phase === 'loading' ? (
          <p class="reader__loading ui-font">{t('reader.loading')}</p>
        ) : (
          <PagedText
            blocks={blocks}
            focus={focus}
            lastPageSlot={slot}
            interceptTap={(isLastPage) => {
              if (closeBar()) return true;
              // "Press any key" / [MORE]: a tap on the last page answers it.
              if (awaitingChar && isLastPage) {
                sendChar('return');
                return true;
              }
              return false;
            }}
          />
        )
      }
    </ReaderFrame>
  );
}
