import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
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
  /** The game's own actions in the menu (Save…, Restore…, Undo, Restart), after "Aa". */
  actions?: ReaderAction[];
}

export interface ReaderAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * Full-screen reader chrome. The top zone opens a menu over the text: the app's top bar and the reader's own
 * actions (text settings "Aa", the game's actions, refresh screen); transcript and help join it in S1.6.
 */
export function ReaderFrame({ tuid, heading, children, actions }: Props) {
  const [barOpen, setBarOpen] = useState(false);
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
        class="reader__top ui-font"
        aria-expanded={barOpen}
        aria-label={t('reader.navigation')}
        onClick={() => setBarOpen(!barOpen)}
      >
        {heading}
        <span aria-hidden="true">⋯</span>
      </button>
      {barOpen && (
        <div class="reader__bar">
          <TopBar current="play" />
          <div class="reader__actions ui-font" role="group" aria-label={t('reader.menu')}>
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
