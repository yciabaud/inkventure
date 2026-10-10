import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import type { ReaderSettings } from '../../reader/settings';
import { getStore } from '../../storage';
import { refreshScreen } from '../../ui/refreshScreen';
import { StorageNotice } from '../../ui/StorageNotice';
import { TopBar } from '../../ui/TopBar';
import { TextSettings } from './TextSettings';
import { useReaderSettings } from './useReaderSettings';

interface Props {
  /** The game (or demo) shown: its text settings may override the defaults. */
  tuid: string;
  /** Content of the top zone: the status line, or the story title. */
  heading: ComponentChildren;
  /**
   * The reader body. `closeBar` closes the top menu if it is open and says whether it was: a tap on the page then
   * only closes the menu. `settings` are the text settings to lay the pages out with.
   */
  children: (closeBar: () => boolean, settings: ReaderSettings) => ComponentChildren;
  /** Shown in the menu under the actions (the rows of the status window that the top zone has no room for). */
  menuNote?: ComponentChildren;
  /** The game's own actions in the menu (Save…, Restore…, Undo, Restart, Transcript), after "Aa". */
  actions?: ReaderAction[];
  /** "Aa" in the menu (default): not for a game whose text the settings cannot change (Decker draws its own). */
  textSettings?: boolean;
}

export interface ReaderAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Full-screen reader chrome. The top zone opens a menu over the text: the app's top bar and the reader's own
 * actions (text settings "Aa", the game's actions and Transcript, refresh screen).
 */
export function ReaderFrame({
  tuid,
  heading,
  children,
  actions,
  menuNote,
  textSettings = true,
}: Props) {
  const [barOpen, setBarOpen] = useState(false);
  // The menu opens under the top zone, whose height follows the rows of the status window.
  const [barTop, setBarTop] = useState(0);
  const topRef = useRef<HTMLButtonElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const readerSettings = useReaderSettings(tuid);
  const closeBar = () => {
    if (!barOpen) return false;
    setBarOpen(false);
    return true;
  };
  return (
    <div class="reader">
      <button
        type="button"
        ref={topRef}
        class="reader__top ui-font"
        aria-expanded={barOpen}
        aria-label={t('reader.navigation')}
        onClick={() => {
          if (topRef.current) setBarTop(topRef.current.offsetHeight);
          setBarOpen(!barOpen);
        }}
      >
        {heading}
        <span aria-hidden="true">⋯</span>
      </button>
      {barOpen && (
        <div class="reader__bar" style={barTop ? { top: barTop + 'px' } : undefined}>
          <TopBar current="play" />
          <div class="reader__actions ui-font" role="group" aria-label={t('reader.menu')}>
            {textSettings && (
              <button
                type="button"
                class="reader__action"
                onClick={() => {
                  setBarOpen(false);
                  setSettingsOpen(true);
                }}
              >
                <span class="reader__aa" aria-hidden="true">
                  Aa
                </span>
                {t('reader.textSettings')}
              </button>
            )}
            {(actions || []).map((action) => (
              <button
                key={action.label}
                type="button"
                class="reader__action"
                disabled={action.disabled}
                onClick={() => {
                  setBarOpen(false);
                  action.onSelect();
                }}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              class="reader__action"
              onClick={() => {
                setBarOpen(false);
                refreshScreen();
              }}
            >
              {t('menu.refresh')}
            </button>
          </div>
          {menuNote}
        </div>
      )}
      <StorageNotice store={getStore()} />
      {children(closeBar, readerSettings.settings)}
      {settingsOpen && (
        <TextSettings state={readerSettings} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
