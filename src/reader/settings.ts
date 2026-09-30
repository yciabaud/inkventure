// Reader text settings (SPEC §3.6, "Aa"): defaults in prefs, optional override per game in its progress record.
import { getPrefs, keys, setPrefs, type Store } from '../storage';

export type Typeface = 'serif' | 'sans' | 'dyslexic';
export type Margins = 'narrow' | 'normal' | 'wide';
export type Spacing = 'tight' | 'normal' | 'loose';
export type Align = 'left' | 'justify';

export interface ReaderSettings {
  /** Index in FONT_SIZES. */
  size: number;
  typeface: Typeface;
  margins: Margins;
  spacing: Spacing;
  align: Align;
}

/** Six steps, in px. */
export const FONT_SIZES = [14, 16, 18, 21, 24, 28];
export const TYPEFACES: Typeface[] = ['serif', 'sans', 'dyslexic'];
export const MARGINS: Margins[] = ['narrow', 'normal', 'wide'];
export const SPACINGS: Spacing[] = ['tight', 'normal', 'loose'];
export const ALIGNS: Align[] = ['left', 'justify'];

export const DEFAULT_SETTINGS: ReaderSettings = {
  size: 2,
  typeface: 'serif',
  margins: 'normal',
  spacing: 'normal',
  align: 'left',
};

const FAMILIES: Record<Typeface, string> = {
  serif: "Literata, Georgia, 'Times New Roman', serif",
  sans: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif",
  // No bundled dyslexia font (OpenDyslexic would exceed the font budget): a plain, wide sans with extra spacing.
  dyslexic: "Verdana, Tahoma, 'Trebuchet MS', 'Source Sans 3', sans-serif",
};
const PADDING: Record<Margins, number> = { narrow: 12, normal: 24, wide: 48 };
const LINE_HEIGHT: Record<Spacing, number> = { tight: 1.3, normal: 1.5, loose: 1.8 };

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.indexOf(value as T) >= 0 ? (value as T) : fallback;
}

/** Any stored value → valid settings (unknown or missing fields take the fallback's). */
export function normalize(
  raw: unknown,
  fallback: ReaderSettings = DEFAULT_SETTINGS,
): ReaderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const size =
    typeof r.size === 'number' && r.size >= 0 && r.size < FONT_SIZES.length
      ? Math.floor(r.size)
      : fallback.size;
  return {
    size: size,
    typeface: oneOf(r.typeface, TYPEFACES, fallback.typeface),
    margins: oneOf(r.margins, MARGINS, fallback.margins),
    spacing: oneOf(r.spacing, SPACINGS, fallback.spacing),
    align: oneOf(r.align, ALIGNS, fallback.align),
  };
}

/** Font size one step smaller (−1) or larger (+1), within the six steps. */
export function stepSize(settings: ReaderSettings, step: -1 | 1): ReaderSettings {
  const size = Math.max(0, Math.min(FONT_SIZES.length - 1, settings.size + step));
  return { ...settings, size: size };
}

/** Inline style of the text area: the measurement layer is created inside it, so it inherits the same values. */
export function textStyle(settings: ReaderSettings): Record<string, string> {
  const style: Record<string, string> = {
    fontFamily: FAMILIES[settings.typeface],
    fontSize: FONT_SIZES[settings.size] + 'px',
    lineHeight: String(LINE_HEIGHT[settings.spacing]),
    textAlign: settings.align,
    paddingLeft: PADDING[settings.margins] + 'px',
    paddingRight: PADDING[settings.margins] + 'px',
  };
  if (settings.typeface === 'dyslexic') {
    style.letterSpacing = '0.05em';
    style.wordSpacing = '0.12em';
  }
  return style;
}

/** A key that changes whenever the settings change the layout. */
export function settingsKey(settings: ReaderSettings): string {
  return [
    settings.size,
    settings.typeface,
    settings.margins,
    settings.spacing,
    settings.align,
  ].join('|');
}

// --- Persistence ------------------------------------------------------------------------------

interface ProgressWithReader {
  reader?: unknown;
  [key: string]: unknown;
}

export function getDefaults(store: Store): ReaderSettings {
  return normalize(getPrefs(store).reader);
}

export function setDefaults(store: Store, settings: ReaderSettings): void {
  setPrefs(store, { reader: { ...settings } });
}

/** The game's override, if any. */
export function getOverride(store: Store, tuid: string): ReaderSettings | undefined {
  const progress = store.get<ProgressWithReader>(keys.progress(tuid));
  return progress && progress.reader ? normalize(progress.reader, getDefaults(store)) : undefined;
}

/** Sets (or, with undefined, removes) the game's override, keeping the rest of its progress record. */
export function setOverride(
  store: Store,
  tuid: string,
  settings: ReaderSettings | undefined,
): void {
  const key = keys.progress(tuid);
  const progress: ProgressWithReader = { ...(store.get<ProgressWithReader>(key) || {}) };
  if (settings) progress.reader = { ...settings };
  else delete progress.reader;
  store.set(key, progress);
}

/** What the game is shown with: its override, else the defaults. */
export function effectiveSettings(store: Store, tuid: string): ReaderSettings {
  return getOverride(store, tuid) || getDefaults(store);
}
