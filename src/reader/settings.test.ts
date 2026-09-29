import { describe, expect, it } from 'vitest';
import { MemoryBackend } from '../storage/backend';
import { getPrefs } from '../storage/prefs';
import { createStore } from '../storage/store';
import {
  DEFAULT_SETTINGS,
  effectiveSettings,
  FONT_SIZES,
  getDefaults,
  getOverride,
  normalize,
  setDefaults,
  setOverride,
  settingsKey,
  stepSize,
  textStyle,
} from './settings';

describe('normalize', () => {
  it('keeps valid values and replaces invalid ones with the fallback', () => {
    expect(normalize(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(
      normalize({ size: 5, typeface: 'sans', margins: 'wide', spacing: 'loose', align: 'justify' }),
    ).toEqual({
      size: 5,
      typeface: 'sans',
      margins: 'wide',
      spacing: 'loose',
      align: 'justify',
    });
    expect(normalize({ size: 9, typeface: 'comic', align: 'center' })).toEqual(DEFAULT_SETTINGS);
    expect(normalize({ size: -1 }).size).toBe(DEFAULT_SETTINGS.size);
    expect(normalize('garbage')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('stepSize', () => {
  it('moves one of six steps and stops at both ends', () => {
    expect(FONT_SIZES.length).toBe(6);
    expect(stepSize(DEFAULT_SETTINGS, 1).size).toBe(DEFAULT_SETTINGS.size + 1);
    expect(stepSize({ ...DEFAULT_SETTINGS, size: 5 }, 1).size).toBe(5);
    expect(stepSize({ ...DEFAULT_SETTINGS, size: 0 }, -1).size).toBe(0);
  });
});

describe('textStyle / settingsKey', () => {
  it('maps settings to the text area style', () => {
    const style = textStyle({
      size: 4,
      typeface: 'sans',
      margins: 'wide',
      spacing: 'tight',
      align: 'justify',
    });
    expect(style.fontSize).toBe('24px');
    expect(style.fontFamily).toContain('Source Sans 3');
    expect(style.paddingLeft).toBe('48px');
    expect(style.lineHeight).toBe('1.3');
    expect(style.textAlign).toBe('justify');
    expect(style.letterSpacing).toBeUndefined();
    expect(textStyle({ ...DEFAULT_SETTINGS, typeface: 'dyslexic' }).letterSpacing).toBe('0.05em');
  });

  it('changes with every setting', () => {
    const keys = new Set([
      settingsKey(DEFAULT_SETTINGS),
      settingsKey(stepSize(DEFAULT_SETTINGS, 1)),
      settingsKey({ ...DEFAULT_SETTINGS, typeface: 'sans' }),
      settingsKey({ ...DEFAULT_SETTINGS, margins: 'wide' }),
      settingsKey({ ...DEFAULT_SETTINGS, spacing: 'loose' }),
      settingsKey({ ...DEFAULT_SETTINGS, align: 'justify' }),
    ]);
    expect(keys.size).toBe(6);
  });
});

describe('persistence', () => {
  it('stores defaults in prefs, next to the other preferences', () => {
    const store = createStore(new MemoryBackend());
    store.set('prefs', { locale: 'fr' });
    expect(getDefaults(store)).toEqual(DEFAULT_SETTINGS);
    setDefaults(store, { ...DEFAULT_SETTINGS, size: 4 });
    expect(getDefaults(store).size).toBe(4);
    expect(getPrefs(store).locale).toBe('fr');
  });

  it('lets a game override the defaults, and removing the override brings them back', () => {
    const store = createStore(new MemoryBackend());
    setDefaults(store, { ...DEFAULT_SETTINGS, size: 3 });
    store.set('progress:game1', { lastPlayed: 42 });
    expect(getOverride(store, 'game1')).toBeUndefined();
    expect(effectiveSettings(store, 'game1').size).toBe(3);

    setOverride(store, 'game1', { ...DEFAULT_SETTINGS, typeface: 'sans' });
    expect(effectiveSettings(store, 'game1').typeface).toBe('sans');
    expect(effectiveSettings(store, 'game2').typeface).toBe('serif');
    expect(store.get('progress:game1')).toMatchObject({ lastPlayed: 42 });

    setOverride(store, 'game1', undefined);
    expect(getOverride(store, 'game1')).toBeUndefined();
    expect(store.get('progress:game1')).toEqual({ lastPlayed: 42 });
  });
});
