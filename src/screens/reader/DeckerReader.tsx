// A Decker deck in the reader (SPEC §4.3; story S1.29): Decker's web runtime, patched for e-ink
// (scripts/build/decker-runtime.ts), runs the deck in a sandboxed frame (scripts only, opaque origin: it cannot reach
// this page, its storage or the top window). The frame sends the deck back a moment after the player changed it; the
// reader keeps it under `save:<tuid>:decker` and opens it instead of the original next time. No Save / Restore / Undo
// / Transcript, and no "Aa": the deck draws its own pixels.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  deckerHtml,
  deckerMessage,
  deckText,
  type DeckerRuntime,
} from '../../engines/decker/deckerHtml';
import { t } from '../../i18n/i18n';
import { addToHome, getStore, isStorageFullError } from '../../storage';
import { ErrorPage } from '../../ui/ErrorPage';
import { ReaderFrame } from './ReaderFrame';
import { RestartDialog } from './SaveDialogs';

type DeckerStorage = typeof import('../../storage/decker');
type SavesModule = typeof import('../../storage/saves');

interface Props {
  tuid: string;
  title: string;
  author?: string;
  cover?: boolean;
  /** The deck file (Decker's text format, or a web export's page). Absent: the tour deck (the fixture). */
  story?: Uint8Array;
}

interface Loaded {
  runtime: DeckerRuntime;
  storage: DeckerStorage;
  saves: SavesModule;
  /** The deck as published. */
  deck: string;
  /** The deck as the player left it, when kept. */
  saved: string | null;
}

type State =
  { phase: 'loading' } | { phase: 'failed'; message: string } | { phase: 'ready'; loaded: Loaded };

function fetchText(url: string): Promise<string> {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.text();
  });
}

export function DeckerReader({ tuid, title, author, cover, story }: Props) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [restarting, setRestarting] = useState(false);
  // The deck's own name, once it has drawn.
  const [deckTitle, setDeckTitle] = useState<string | null>(null);
  // The deck is too large to keep: said once.
  const [tooLarge, setTooLarge] = useState(false);
  // Bumped by Restart: a new frame opens the deck as published.
  const [run, setRun] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const addedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('virtual:decker-runtime'),
      import('../../storage/decker'),
      import('../../storage/saves'),
    ])
      .then(([urls, storage, saves]) =>
        Promise.all([
          fetchText(urls.lilUrl),
          fetchText(urls.uiUrl),
          story ? Promise.resolve(new TextDecoder().decode(story)) : fetchText(urls.tourUrl),
        ]).then(([lil, ui, file]) => {
          if (cancelled) return;
          const deck = deckText(file);
          if (!deck) {
            setState({ phase: 'failed', message: t('reader.gameLoadFailed') });
            return;
          }
          setState({
            phase: 'ready',
            loaded: {
              runtime: { lil: lil, ui: ui },
              storage: storage,
              saves: saves,
              deck: deck,
              saved: storage.readDeckerSave(getStore(), tuid),
            },
          });
        }),
      )
      .catch(() => {
        if (!cancelled) setState({ phase: 'failed', message: t('reader.gameLoadFailed') });
      });
    return () => {
      cancelled = true;
    };
  }, [story, tuid]);

  const loaded = state.phase === 'ready' ? state.loaded : null;

  /** The deck is being played: in My adventures, last played now. */
  function played() {
    if (!loaded) return;
    const store = getStore();
    const now = Date.now();
    try {
      if (!addedRef.current) {
        addToHome(store, { tuid: tuid, title: title, author: author || '', cover: cover }, now);
        addedRef.current = true;
      }
      loaded.saves.updateProgress(store, tuid, { lastPlayed: now });
    } catch (error) {
      if (!isStorageFullError(error)) console.error('Progress update failed', error);
    }
  }

  /** Keeps the deck as the player left it. Storage full: the StorageNotice says so. */
  function save(deck: string) {
    if (!loaded) return;
    try {
      if (!loaded.storage.writeDeckerSave(getStore(), tuid, deck, Date.now())) setTooLarge(true);
    } catch (error) {
      if (!isStorageFullError(error)) console.error('Deck save failed', error);
    }
    played();
  }

  const playedRef = useRef(played);
  const saveRef = useRef(save);
  // A layout effect: up to date before the frame can post, which can be before passive effects run (WebKit).
  useLayoutEffect(() => {
    playedRef.current = played;
    saveRef.current = save;
  });

  // A layout effect: listening before the frame starts.
  useLayoutEffect(() => {
    if (!loaded) return;
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const message = deckerMessage(event.data);
      if (!message) return;
      if (message.type === 'ready') playedRef.current();
      else if (message.type === 'title') setDeckTitle(message.title.trim() || null);
      else if (message.type === 'save') saveRef.current(message.deck);
      else console.error('Decker: ' + message.message);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loaded]);

  if (state.phase === 'failed') return <ErrorPage message={state.message} />;

  function restart() {
    if (!loaded) return;
    setRestarting(false);
    loaded.storage.clearDeckerSave(getStore(), tuid);
    setTooLarge(false);
    setState({ phase: 'ready', loaded: { ...loaded, saved: null } });
    setRun((n) => n + 1);
  }

  return (
    <ReaderFrame
      tuid={tuid}
      textSettings={false}
      heading={
        <span class="reader__status">
          <span class="reader__title">{deckTitle || title}</span>
          <span class="badge reader__badge">{t('game.experimental')}</span>
        </span>
      }
      actions={loaded ? [{ label: t('reader.restart'), onSelect: () => setRestarting(true) }] : []}
    >
      {() =>
        loaded ? (
          <div class="reader__body">
            <DeckerFrame key={run} title={deckTitle || title} loaded={loaded} frameRef={frameRef} />
            {tooLarge && (
              <p class="reader__indicator ui-font" role="status">
                {t('decker.tooLarge')}
              </p>
            )}
            {restarting && (
              <RestartDialog
                text={t('decker.restartText')}
                onConfirm={restart}
                onClose={() => setRestarting(false)}
              />
            )}
          </div>
        ) : (
          <p class="reader__loading ui-font">{t('reader.loading')}</p>
        )
      }
    </ReaderFrame>
  );
}

interface FrameProps {
  title: string;
  loaded: Loaded;
  frameRef: { current: HTMLIFrameElement | null };
}

/** The sandboxed frame, its page built once (a new frame on Restart). */
function DeckerFrame({ title, loaded, frameRef }: FrameProps) {
  const [html] = useState(() => deckerHtml(loaded.saved || loaded.deck, loaded.runtime));
  return (
    <iframe
      ref={frameRef}
      class="decker__frame"
      title={title}
      sandbox="allow-scripts"
      srcdoc={html}
    />
  );
}
