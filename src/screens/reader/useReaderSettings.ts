import { useState } from 'preact/hooks';
import {
  effectiveSettings,
  getDefaults,
  getOverride,
  setDefaults,
  setOverride,
  type ReaderSettings,
} from '../../reader/settings';
import { getStore } from '../../storage';

export interface ReaderSettingsState {
  settings: ReaderSettings;
  /** The game has its own settings instead of the defaults. */
  perGame: boolean;
  update: (next: ReaderSettings) => void;
  setPerGame: (perGame: boolean) => void;
}

/** Text settings of the reader for game `tuid`: saved to the game's override when it has one, else as defaults. */
export function useReaderSettings(tuid: string): ReaderSettingsState {
  const store = getStore();
  const [settings, setSettings] = useState(() => effectiveSettings(store, tuid));
  const [perGame, setPerGameState] = useState(() => getOverride(store, tuid) !== undefined);

  function save(next: ReaderSettings, override: boolean) {
    try {
      if (override) setOverride(store, tuid, next);
      else setDefaults(store, next);
    } catch {
      // Storage full: the StorageNotice tells the reader; the change still applies for this session.
    }
  }

  return {
    settings: settings,
    perGame: perGame,
    update: (next) => {
      setSettings(next);
      save(next, perGame);
    },
    setPerGame: (on) => {
      setPerGameState(on);
      try {
        // On: the current look becomes this game's. Off: back to the defaults.
        setOverride(store, tuid, on ? settings : undefined);
      } catch {
        // see above
      }
      if (!on) setSettings(getDefaults(store));
    },
  };
}
