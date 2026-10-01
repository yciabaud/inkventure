// Settings (SPEC §3.1, §6, §7; story S5.1): the UI language on the first page, then one page per section (reading
// defaults, data and storage, about) so that nothing scrolls.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { formatHash, navigate } from '../../app/router';
import {
  detectLocale,
  formatDate,
  formatNumber,
  getLocale,
  setLocale,
  t,
  type Locale,
  type MessageKey,
} from '../../i18n/i18n';
import { changeLocale, initLocale } from '../../i18n/locale';
import { getDefaults, setDefaults, textStyle, type ReaderSettings } from '../../reader/settings';
import { getPrefs, getStore, setPrefs, type UsageGroup } from '../../storage';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { PagedParagraphs } from '../../ui/PagedParagraphs';
import { Choice, ReaderSettingsForm } from '../reader/TextSettings';

type Section = 'reading' | 'data' | 'about';

const SECTIONS: Array<{ name: Section; label: MessageKey }> = [
  { name: 'reading', label: 'settings.reading' },
  { name: 'data', label: 'settings.data' },
  { name: 'about', label: 'settings.about' },
];

/** Language names are written in their own language, whatever the UI language. */
const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };

type LanguageChoice = Locale | 'auto';

const ABOUT: MessageKey[] = [
  'about.intro',
  'about.ifdb',
  'about.archive',
  'about.engines',
  'about.fonts',
  'about.privacy',
  'about.ebook',
  'about.source',
];

/** A file or folder next to the app, e.g. "ebook/": shown as text (an e-reader cannot easily download a file). */
export function siteAddress(href: string, path: string): string {
  return (
    href
      .split('#')[0]
      .split('?')[0]
      .replace(/[^/]*$/, '') + path
  );
}

/** The ebook download page (S6.3). */
export function ebookAddress(href: string): string {
  return siteAddress(href, 'ebook/');
}

/** The address each About paragraph shows, if any. */
function aboutParams(key: MessageKey): { address: string } | undefined {
  if (key === 'about.ebook') return { address: ebookAddress(location.href) };
  if (key === 'about.source') return { address: siteAddress(location.href, 'licences.txt') };
  return undefined;
}

/** 1234 characters → "2 KB"; a megabyte and more → "1.5 MB". */
export function formatSize(chars: number): string {
  const kb = chars / 1024;
  if (kb < 1024) return t('size.kb', { n: Math.ceil(kb) });
  return t('size.mb', { n: formatNumber(kb / 1024, getLocale(), 1) });
}

function sectionHref(section?: Section): string {
  return formatHash({ name: 'settings' }, section ? { s: section } : {});
}

/** A section page: its title follows a "‹" back to the first page of Settings. */
function SectionPage({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="screen settings-page ui-font">
      <h1 class="screen__title settings-page__title">
        <a class="settings-page__back" href={sectionHref()} aria-label={t('settings.back')}>
          ‹
        </a>
        <span>{title}</span>
      </h1>
      {children}
    </div>
  );
}

function savedLanguage(): LanguageChoice {
  const saved = getPrefs(getStore()).locale;
  return saved === 'en' || saved === 'fr' ? saved : 'auto';
}

function Home() {
  const [current, setCurrent] = useState(savedLanguage);
  function choose(value: LanguageChoice) {
    const locale = value === 'auto' ? undefined : value;
    setCurrent(value);
    try {
      changeLocale(getStore(), locale);
    } catch {
      // Storage full: the StorageNotice says so; the choice still applies until the page is closed.
      setLocale(locale || detectLocale());
    }
  }
  return (
    <div class="screen settings-page ui-font">
      <h1 class="screen__title">{t('settings.title')}</h1>
      <Choice<LanguageChoice>
        label={t('settings.language')}
        values={['auto', 'en', 'fr']}
        current={current}
        labelOf={(value) => (value === 'auto' ? t('settings.languageAuto') : LANGUAGE_NAMES[value])}
        onChoose={choose}
      />
      <p class="settings-page__hint">{t('settings.languageHint')}</p>
      <nav aria-label={t('settings.sections')}>
        <ul class="menu settings-page__sections">
          {SECTIONS.map((section) => (
            <li key={section.name}>
              <a class="menu__item" href={sectionHref(section.name)}>
                {t(section.label)} ›
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function Reading() {
  const store = getStore();
  const [settings, setSettings] = useState(() => getDefaults(store));
  function update(next: ReaderSettings) {
    setSettings(next);
    try {
      setDefaults(store, next);
    } catch {
      // Storage full: the StorageNotice says so; the preview still shows the choice.
    }
  }
  return (
    <SectionPage title={t('settings.reading')}>
      <p class="settings-page__hint">{t('settings.readingHint')}</p>
      <div class="settings settings--page">
        <ReaderSettingsForm settings={settings} onChange={update} />
      </div>
      <p class="settings-page__sample" style={textStyle(settings)}>
        {t('settings.sample')}
      </p>
    </SectionPage>
  );
}

function UsageLine({ label, group }: { label: MessageKey; group: UsageGroup }) {
  if (!group.count) return null;
  return <li>{t(label, { count: group.count, size: formatSize(group.size) })}</li>;
}

function Data() {
  const store = getStore();
  const usage = store.usage();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const cancel = () => setStep(0);
  return (
    <SectionPage title={t('settings.data')}>
      {!store.persistent && <p class="settings-page__hint">{t('settings.notPersistent')}</p>}
      <p class="settings-page__usage">
        {t('settings.usageTotal', { size: formatSize(usage.total) })}
      </p>
      <ul class="settings-page__list">
        <UsageLine label="settings.usageSaves" group={usage.saves} />
        <UsageLine label="settings.usageAutosaves" group={usage.autosaves} />
        <UsageLine label="settings.usageFiles" group={usage.files} />
        {usage.other.count > 0 && (
          <li>{t('settings.usageOther', { size: formatSize(usage.other.size) })}</li>
        )}
      </ul>
      <div class="settings-page__danger">
        <p class="settings-page__hint">{t('settings.resetHint')}</p>
        <Button variant="secondary" onClick={() => setStep(1)}>
          {t('settings.reset')}
        </Button>
      </div>
      {step === 1 && (
        <Dialog title={t('settings.resetTitle')} onClose={cancel}>
          <div class="saves ui-font">
            <p class="saves__hint">{t('settings.resetText')}</p>
            <div class="saves__buttons">
              <Button variant="secondary" onClick={cancel}>
                {t('saves.cancel')}
              </Button>
              <Button onClick={() => setStep(2)}>{t('settings.resetContinue')}</Button>
            </div>
          </div>
        </Dialog>
      )}
      {step === 2 && (
        <Dialog title={t('settings.resetConfirmTitle')} onClose={cancel}>
          <div class="saves ui-font">
            <p class="saves__hint">{t('settings.resetConfirmText')}</p>
            <div class="saves__buttons">
              <Button variant="secondary" onClick={cancel}>
                {t('saves.cancel')}
              </Button>
              <Button onClick={resetAll}>{t('settings.resetConfirm')}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </SectionPage>
  );
}

/** Deletes every `ik:` entry, then shows Home as on a first launch (language back to the browser's). */
function resetAll() {
  const store = getStore();
  store.clearAll();
  initLocale(store);
  navigate({ name: 'home' });
}

/** Commit and date of this build, from the meta tag the build writes (absent in development). */
function buildVersion(): string {
  const meta = document.querySelector('meta[name="inkventure-build"]');
  const parts = ((meta && meta.getAttribute('content')) || '').split(' ');
  const date = new Date(parts[1] || '');
  if (!parts[0] || parts[0] === 'unknown' || isNaN(date.getTime())) {
    return t('settings.versionDev');
  }
  return t('settings.version', { commit: parts[0].slice(0, 7), date: formatDate(date) });
}

type Toggle = 'off' | 'on';

/** Timings (Home, Library, page turns and game turns), for measuring on a device without editing the address (`?perf=1`). */
function TurnTimes() {
  const [current, setCurrent] = useState<Toggle>(() =>
    getPrefs(getStore()).turnTimes ? 'on' : 'off',
  );
  function choose(value: Toggle) {
    setCurrent(value);
    try {
      setPrefs(getStore(), { turnTimes: value === 'on' ? true : undefined });
    } catch {
      // Storage full: the StorageNotice says so.
    }
  }
  return (
    <>
      <Choice<Toggle>
        label={t('settings.turnTimes')}
        values={['off', 'on']}
        current={current}
        labelOf={(value) => t(value === 'on' ? 'settings.on' : 'settings.off')}
        onChoose={choose}
      />
      <p class="settings-page__hint">{t('settings.turnTimesHint')}</p>
    </>
  );
}

function About() {
  return (
    <SectionPage title={t('settings.about')}>
      <p class="settings-page__version">{buildVersion()}</p>
      <TurnTimes />
      <PagedParagraphs
        key={getLocale()}
        paragraphs={ABOUT.map((key) => t(key, aboutParams(key)))}
      />
    </SectionPage>
  );
}

export function SettingsScreen({ query = {} }: { query?: Record<string, string> }) {
  switch (query.s) {
    case 'reading':
      return <Reading />;
    case 'data':
      return <Data />;
    case 'about':
      return <About />;
    default:
      return <Home />;
  }
}
