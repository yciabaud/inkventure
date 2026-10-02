// A Twine story in the reader (SPEC §4.3; story S1.9): the story's own page runs in a sandboxed frame (scripts only,
// opaque origin: it cannot reach this page, its storage or the top window). It gets the e-ink stylesheet and a frame
// script (frameScript.ts) that turns pages on taps and stands in for its storage, which the reader keeps under
// `save:<tuid>:twine`. The story format's own saves are used; the reader's Save / Restore / Undo are not offered.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { FRAME_MESSAGE, type FrameMessage } from '../../engines/twine/messages';
import type { ReaderSettings } from '../../reader/settings';
import { t } from '../../i18n/i18n';
import { addToHome, getStore, isStorageFullError } from '../../storage';
import type { StoryFiles } from '../../storage/files';
import type { TwineStorage } from '../../storage/twine';
import { ErrorPage } from '../../ui/ErrorPage';
import { ReaderFrame } from './ReaderFrame';
import { RestartDialog } from './SaveDialogs';

type TwineModule = typeof import('../../engines/twine/twineHtml');
type StoryAssets = import('../../engines/twine/twineHtml').StoryAssets;
type StorageModule = typeof import('../../storage/twine');
type SavesModule = typeof import('../../storage/saves');

/** Changes to the story's storage are written this long after the last one (and when leaving). */
const WRITE_DELAY_MS = 1000;

interface Props {
  tuid: string;
  title: string;
  author?: string;
  cover?: boolean;
  /** The published story (HTML). */
  story: Uint8Array;
  /** The files kept from the story's zip (pictures, fonts, styles, scripts), served to it (story S1.11). */
  files?: StoryFiles;
  /** Where the story was downloaded from: its relative links (images) resolve there. */
  baseUrl?: string;
}

interface Loaded {
  twine: TwineModule;
  storage: StorageModule;
  saves: SavesModule;
  html: string;
  /** The story's own files, when its zip had some. */
  assets?: StoryAssets;
  /** The story's storage when its frame starts. */
  saved: TwineStorage;
}

type State = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; loaded: Loaded };

export function TwineReader({ tuid, title, author, cover, story, files, baseUrl }: Props) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [page, setPage] = useState<{ page: number; pages: number } | null>(null);
  const [restarting, setRestarting] = useState(false);
  // Bumped by Restart: a new frame starts the story again.
  const [run, setRun] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const storageRef = useRef<TwineStorage>({ local: {}, session: {} });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('../../engines/twine/twineHtml'),
      import('../../storage/twine'),
      import('../../storage/saves'),
    ]).then(
      ([twine, storage, saves]) => {
        if (cancelled) return;
        const html = twine.storyHtml(story);
        if (!twine.isTwineStory(html)) {
          setState({ phase: 'failed' });
          return;
        }
        const saved = storage.readTwineStorage(getStore(), tuid);
        storageRef.current = saved;
        const loaded: Loaded = {
          twine: twine,
          storage: storage,
          saves: saves,
          html: html,
          saved: saved,
        };
        if (files && Object.keys(files).length) loaded.assets = twine.storyAssets(files);
        setState({ phase: 'ready', loaded: loaded });
      },
      () => !cancelled && setState({ phase: 'failed' }),
    );
    return () => {
      cancelled = true;
    };
  }, [story, files, tuid]);

  const loaded = state.phase === 'ready' ? state.loaded : null;

  /** Writes the story's storage now. Storage full: the StorageNotice says so. */
  function writeStorage() {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!loaded) return;
    try {
      if (!loaded.storage.writeTwineStorage(getStore(), tuid, storageRef.current, Date.now()))
        console.warn('Twine story storage over its limit: not saved');
    } catch (error) {
      if (!isStorageFullError(error)) console.error('Twine storage write failed', error);
    }
  }
  const writeRef = useRef(writeStorage);

  /** The story is being played: in My adventures, last played now. */
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
  const playedRef = useRef(played);
  // A layout effect: up to date before the frame can post, which can be before passive effects run (WebKit).
  useLayoutEffect(() => {
    writeRef.current = writeStorage;
    playedRef.current = played;
  });

  // A layout effect: listening before the frame starts, whose first page report (sent once) must not be missed.
  useLayoutEffect(() => {
    if (!loaded) return;
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      const message = event.data as FrameMessage | null;
      if (!frame || event.source !== frame.contentWindow) return;
      if (!message || typeof message !== 'object' || message.source !== FRAME_MESSAGE) return;
      if (message.type === 'storage' && (message.area === 'local' || message.area === 'session')) {
        storageRef.current = {
          ...storageRef.current,
          [message.area]: loaded.storage.toItems(message.items),
        };
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => writeRef.current(), WRITE_DELAY_MS);
      } else if (message.type === 'asset' && loaded.assets && typeof message.ref === 'string') {
        const path = loaded.assets.resolve(message.ref);
        if (path && frame.contentWindow) {
          frame.contentWindow.postMessage(
            {
              source: FRAME_MESSAGE,
              type: 'asset',
              ref: message.ref,
              url: loaded.assets.dataUrl(path),
            },
            '*',
          );
        }
      } else if (message.type === 'page') {
        const pages = Math.max(1, Math.floor(Number(message.pages)) || 1);
        const current = Math.min(pages, Math.max(1, Math.floor(Number(message.page)) || 1));
        setPage({ page: current, pages: pages });
        playedRef.current();
      }
    };
    const onLeave = () => {
      if (timerRef.current !== null) writeRef.current();
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pagehide', onLeave);
      onLeave();
    };
  }, [loaded]);

  if (state.phase === 'failed') return <ErrorPage message={t('reader.gameLoadFailed')} />;

  /** Starts the story again. Its own saves (local) stay unless `erase`; its session (where SugarCube resumes from) goes. */
  function restart(erase: boolean) {
    if (!loaded) return;
    setRestarting(false);
    const saved = { local: erase ? {} : storageRef.current.local, session: {} };
    storageRef.current = saved;
    writeStorage();
    setPage(null);
    setState({ phase: 'ready', loaded: { ...loaded, saved: saved } });
    setRun((n) => n + 1);
  }

  return (
    <ReaderFrame
      tuid={tuid}
      heading={
        <span class="reader__status">
          <span class="reader__title">{title}</span>
          <span class="badge reader__badge">{t('game.experimental')}</span>
        </span>
      }
      actions={loaded ? [{ label: t('reader.restart'), onSelect: () => setRestarting(true) }] : []}
    >
      {(_closeBar, settings) =>
        loaded ? (
          <div class="reader__body">
            <TwineFrame
              key={run}
              title={title}
              loaded={loaded}
              settings={settings}
              baseUrl={baseUrl}
              frameRef={frameRef}
            />
            <p class="reader__indicator ui-font" aria-live="polite">
              {page ? t('twine.page', { page: page.page, pages: page.pages }) : ' '}
            </p>
            {restarting && (
              <RestartDialog
                onConfirm={() => restart(false)}
                onErase={() => restart(true)}
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
  settings: ReaderSettings;
  baseUrl?: string;
  frameRef: { current: HTMLIFrameElement | null };
}

/** The sandboxed frame. Its page is prepared once; later text settings are sent to it as a new stylesheet. */
function TwineFrame({ title, loaded, settings, baseUrl, frameRef }: FrameProps) {
  const [html] = useState(() =>
    loaded.twine.prepareTwineHtml(
      loaded.html,
      loaded.twine.eInkStylesheet(settings),
      loaded.saved,
      baseUrl,
      loaded.assets,
      t('twine.symbolLink'),
    ),
  );
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const frame = frameRef.current;
    if (frame && frame.contentWindow)
      frame.contentWindow.postMessage(
        { source: FRAME_MESSAGE, type: 'style', css: loaded.twine.eInkStylesheet(settings) },
        '*',
      );
  }, [settings, loaded, frameRef]);
  return (
    <iframe
      ref={frameRef}
      class="twine__frame"
      title={title}
      sandbox="allow-scripts"
      srcdoc={html}
    />
  );
}
