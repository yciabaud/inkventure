// Playability resolution and content policy (SPEC §5.2 steps 2–3, §5.4; story S2.2). Pure: turns the crawler's raw
// dataset (data/raw/games.json) into the games the app can play, with the reason for every game left out.
import type { GameRecord } from './ifdb.ts';
import type { RawDataset, RawGame } from './crawler.ts';
import type { InkExport } from './ink.ts';
import { isCandidate, MIN_PICTURES } from './pictures.ts';

/** Story formats the app knows. A format plays once its engine exists; `enabledFormats` lists those. */
export type StoryFormat = 'zcode' | 'glulx' | 'twine' | 'ink';

const ALL_FORMATS: StoryFormat[] = ['zcode', 'glulx', 'twine', 'ink'];

/** IFDB file format ids (`downloads.links[].format`, IFDB's "externid") of each story format. */
const IFDB_FORMATS: Record<string, StoryFormat> = {
  zcode: 'zcode',
  'blorb/zcode': 'zcode',
  glulx: 'glulx',
  'blorb/glulx': 'glulx',
};

/** Story file extensions, for links whose format IFDB does not know. */
const EXTENSIONS: Array<[RegExp, StoryFormat, boolean]> = [
  [/\.(zblorb|zlb)$/i, 'zcode', true],
  [/\.z[1-8]$/i, 'zcode', false],
  [/\.(gblorb|glb)$/i, 'glulx', true],
  [/\.ulx$/i, 'glulx', false],
];

/** Development systems whose HTML output is a Twine story (story formats included). */
const TWINE_SYSTEMS = /twine|harlowe|sugarcube|snowman|chapbook/i;
const INK_SYSTEMS = /\bink(le)?\b/i;

/** Whether a development system is ink (inkle's): `ink`, `Ink`, `Godot, Ink`… but not inklewriter (S2.7). */
export function isInkSystem(devsys: string): boolean {
  return INK_SYSTEMS.test(devsys);
}

/** Hosts whose game pages are not files the app can read (no CORS, no direct file): itch.io (S2.7). */
const PAGE_HOSTS_REFUSED = /(^|\.)itch\.(io|zone)$/i;

export type DropReason =
  | 'no-game-file'
  | 'unsupported-format'
  | 'format-not-enabled'
  | 'compressed-no-primary'
  | 'insecure-url'
  | 'unreadable-host'
  | 'no-ink-story'
  | 'adult-content'
  | 'excluded';

export interface ContentPolicyConfig {
  /** Tags (case-insensitive) that exclude a game from a `general` build. */
  denyTags: string[];
  /** Games left out by hand, whatever the policy (untagged adult content, broken files…). */
  exclude: Array<{ tuid: string; reason: string }>;
  /** Languages set by hand (S2.6), applied last: `{ tuid: { language: 'en', reason: '…' } }`. */
  languages?: Record<string, { language: string; reason: string }>;
}

export type ContentPolicy = 'general' | 'adult';

export interface ResolveOptions {
  enabledFormats: StoryFormat[];
  policy: ContentPolicy;
  config: ContentPolicyConfig;
  /**
   * Whether the app can read a file outside the IF Archive from the browser (its host sends CORS headers; checked by
   * `check-cors.ts`). Without it, every host is assumed readable (fixtures, local runs).
   */
  readable?: (url: string) => boolean;
  /**
   * Pictures besides the cover in a story file, when `pictures.ts` could read its Blorb index (undefined otherwise).
   * Without it, no game is illustrated.
   */
  pictures?: (url: string) => number | undefined;
  /**
   * Where the story of an ink web export is (S2.7: its path in the zip, or the URL of the page or script holding it),
   * from the checks of `check-ink.ts`; null when the export has none or was not checked. Without it, the file IFDB
   * names is assumed to hold the story (fixtures, local runs).
   */
  inkStory?: (link: InkExport) => string | null;
}

/** The file the app downloads. `archive`: the story is `primary` inside a zip. */
export interface StoryFile {
  url: string;
  /** IFDB's format id of the link, when it has one (e.g. `blorb/zcode`). */
  ifdbFormat?: string;
  archive?: { type: 'zip'; primary: string };
}

export interface ResolvedGame {
  tuid: string;
  title: string;
  author: string;
  /** Year of first publication. */
  year?: number;
  /** Primary language subtag (`en`, `fr`…) of the file played by default, when known (S2.6). */
  language?: string;
  /** The game's files in its other languages, when IFDB offers one per language (S2.6). */
  versions?: LanguageVersion[];
  genres: string[];
  format: StoryFormat;
  file: StoryFile;
  ifids: string[];
  tags: string[];
  rating?: { average: number; stars: number; count: number };
  starSort?: number;
  playtimeMinutes?: number;
  /** Cover art URL (versioned); the app asks for a thumbnail of it. */
  cover?: string;
  /** "May be slow" badge: no game for now (Glulx turns measured on the Kindle within the < 3 s target, S1.7). */
  slow: boolean;
  /** Its Blorb holds at least MIN_PICTURES pictures besides the cover, in a format whose engine draws them (S2.5). */
  illustrated?: true;
  /** Pictures besides the cover, for an illustrated game. */
  pictures?: number;
  devsys: string;
  description?: string;
  ifdbLink: string;
}

export interface Dropped {
  tuid: string;
  title: string;
  reason: DropReason;
  detail?: string;
}

/** A game whose language is not IFDB's first one (S2.6). */
export interface LanguageChange {
  tuid: string;
  title: string;
  /** IFDB's first language. */
  from?: string;
  to: string;
  source: 'file' | 'override';
  /** The file's description (or name) or the override's reason. */
  detail: string;
  /** The file now played, when it is not the one preferred before reading languages. */
  file?: string;
}

export interface Resolution {
  policy: ContentPolicy;
  enabledFormats: StoryFormat[];
  games: ResolvedGame[];
  dropped: Dropped[];
  /**
   * Counts of dropped games per reason, of playable files per format (enabled or not), and of the kept games whose
   * Blorb could have pictures (`blorbs`), was inspected (`inspected`) and is illustrated.
   */
  counts: {
    kept: number;
    dropped: Partial<Record<DropReason, number>>;
    formats: Record<string, number>;
    pictures: { blorbs: number; inspected: number; illustrated: number };
  };
  /**
   * Languages (S2.6): the kept games whose language is not IFDB's first one (read from their file, or set by hand),
   * the games with a file per language, the count of multi-language games whose main file's language IFDB does not
   * say (assumed; to review by hand), and the overrides that name no kept game.
   */
  languages: {
    changed: LanguageChange[];
    versions: Array<{ tuid: string; title: string; languages: string[] }>;
    assumed: number;
    unknownOverrides: string[];
  };
}

interface Link {
  url: string;
  format?: string;
  isGame?: boolean;
  compression?: string;
  compressedPrimary?: string;
  desc?: string;
}

interface Candidate {
  format: StoryFormat;
  file: StoryFile;
  blorb: boolean;
  onArchive: boolean;
  compressed: boolean;
  index: number;
  /** IFDB's description of the link. */
  desc?: string;
}

const IF_ARCHIVE_HOST = /(^|\.)ifarchive\.org$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** HTTPS URL of a link: IF Archive links are upgraded; other plain-HTTP links cannot be fetched from HTTPS pages. */
export function secureUrl(url: string): string | undefined {
  if (/^https:\/\//i.test(url)) return url;
  if (/^http:\/\//i.test(url) && IF_ARCHIVE_HOST.test(hostOf(url))) {
    return 'https://' + url.slice('http://'.length);
  }
  return undefined;
}

/**
 * Story format of a download link, from IFDB's format id, else the file name and the development system.
 * `inkExport`: the link of an ink game is a web export (a zip or a page), whose story is found by `check-ink.ts`.
 */
export function linkFormat(
  link: Link,
  devsys: string,
): { format: StoryFormat; blorb: boolean; inkExport?: true } | undefined {
  const name = (link.compressedPrimary || link.url).split(/[?#]/)[0];
  if (link.format && IFDB_FORMATS[link.format]) {
    return {
      format: IFDB_FORMATS[link.format],
      blorb: /^blorb\//.test(link.format) || /blorb$|\.[zg]lb$/i.test(name),
    };
  }
  for (const [pattern, format, blorb] of EXTENSIONS) {
    if (pattern.test(name)) return { format: format, blorb: blorb };
  }
  if (link.format === 'hypertextgame' && /\.html?$/i.test(name) && TWINE_SYSTEMS.test(devsys)) {
    return { format: 'twine', blorb: false };
  }
  if (INK_SYSTEMS.test(devsys)) {
    // A compiled ink story is JSON (the inkjs runtime plays it).
    if (/\.json$/i.test(name)) return { format: 'ink', blorb: false };
    // Inky's web export (S2.7): a zip holding its page, or the page itself (not on a game store).
    const page = link.compression
      ? !link.compressedPrimary || /\.(html?|js)$/i.test(name)
      : (link.format === 'hypertextgame' || /\.html?$/i.test(name)) &&
        !PAGE_HOSTS_REFUSED.test(hostOf(link.url));
    if (page) return { format: 'ink', blorb: false, inkExport: true };
  }
  return undefined;
}

/** The chosen file, and the other usable files in order of preference (not checked for CORS). */
type Choice = { file: Candidate; others: Candidate[] } | { reason: DropReason; detail?: string };

/**
 * The best playable file of a record. Preference: an enabled format (in `enabledFormats` order), the IF Archive
 * (its CORS headers are verified, SPEC §5.5), an uncompressed file, a blorb (with its cover and metadata), then
 * IFDB's order. A zip is only usable when IFDB names the story file inside it (`compressedPrimary`). With
 * `readable`, a file outside the IF Archive is only used when there is no IF Archive file and its host lets the app
 * read it (CORS, SPEC §5.5); `readable` is asked about those files only.
 */
export function chooseFile(
  record: GameRecord,
  devsys: string,
  enabled: StoryFormat[],
  readable?: (url: string) => boolean,
  inkStory?: (link: InkExport) => string | null,
): Choice {
  const links = ((record.ifdb.downloads && record.ifdb.downloads.links) || []) as Link[];
  const candidates: Candidate[] = [];
  const problems: Array<{ reason: DropReason; detail: string }> = [];
  let gameLinks = 0;
  links.forEach((link, index) => {
    const detected = link.url ? linkFormat(link, devsys) : undefined;
    if (!detected && !link.isGame) return;
    gameLinks++;
    if (!detected) {
      problems.push({ reason: 'unsupported-format', detail: link.format || link.url });
      return;
    }
    if (link.compression && !(link.compression === 'zip' && link.compressedPrimary)) {
      problems.push({ reason: 'compressed-no-primary', detail: link.url });
      return;
    }
    const url = secureUrl(link.url);
    if (!url) {
      problems.push({ reason: 'insecure-url', detail: link.url });
      return;
    }
    const file: StoryFile = { url: url };
    if (link.format) file.ifdbFormat = link.format;
    if (link.compression) file.archive = { type: 'zip', primary: link.compressedPrimary! };
    if (detected.inkExport && inkStory) {
      // The file that holds the story of an ink web export (S2.7).
      const story = inkStory(
        file.archive ? { url: url, primary: file.archive.primary } : { url: url },
      );
      if (!story) {
        problems.push({ reason: 'no-ink-story', detail: url });
        return;
      }
      if (file.archive) file.archive.primary = story;
      else file.url = story;
    }
    candidates.push({
      format: detected.format,
      file: file,
      blorb: detected.blorb,
      onArchive: IF_ARCHIVE_HOST.test(hostOf(file.url)),
      compressed: !!link.compression,
      index: index,
      desc: typeof link.desc === 'string' ? link.desc : undefined,
    });
  });

  if (!gameLinks) return { reason: 'no-game-file' };
  const usable = candidates.filter((c) => enabled.indexOf(c.format) >= 0);
  if (!usable.length) {
    if (candidates.length) {
      return {
        reason: 'format-not-enabled',
        detail: unique(candidates.map((c) => c.format)).join(', '),
      };
    }
    // Report the most telling problem: an unknown format hides the others.
    const order: DropReason[] = [
      'no-ink-story',
      'unsupported-format',
      'compressed-no-primary',
      'insecure-url',
    ];
    problems.sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason));
    return { reason: problems[0].reason, detail: problems[0].detail };
  }
  usable.sort(
    (a, b) =>
      enabled.indexOf(a.format) - enabled.indexOf(b.format) ||
      Number(b.onArchive) - Number(a.onArchive) ||
      Number(a.compressed) - Number(b.compressed) ||
      Number(b.blorb) - Number(a.blorb) ||
      a.index - b.index,
  );
  if (readable && !usable.some((c) => c.onArchive)) {
    const reachable = usable.filter((c) => readable(c.file.url));
    if (!reachable.length) return { reason: 'unreadable-host', detail: usable[0].file.url };
    return { file: reachable[0], others: reachable.slice(1) };
  }
  return { file: usable[0], others: usable.slice(1) };
}

/** The files outside the IF Archive that the choice of a game's file depends on (to check with `check-cors.ts`). */
export function urlsToCheck(
  record: GameRecord,
  devsys: string,
  enabled: StoryFormat[],
  inkStory?: (link: InkExport) => string | null,
): string[] {
  const urls: string[] = [];
  const choice = chooseFile(
    record,
    devsys,
    enabled,
    (url) => {
      urls.push(url);
      return false;
    },
    inkStory,
  );
  // A game in several languages may offer a file per language (S2.6): its other files outside the IF Archive.
  if ('file' in choice && languagesOf((record.bibliographic || {}).language).length > 1) {
    for (const other of choice.others) {
      if (!other.onArchive && urls.indexOf(other.file.url) < 0) urls.push(other.file.url);
    }
  }
  return urls;
}

function unique<T>(items: T[]): T[] {
  return items.filter((item, i) => items.indexOf(item) === i);
}

/** Language names, in English and in the languages themselves (and in French), without accents. */
const LANGUAGE_NAMES: Record<string, string> = {
  english: 'en',
  anglais: 'en',
  ingles: 'en',
  inglese: 'en',
  englisch: 'en',
  french: 'fr',
  francais: 'fr',
  frances: 'fr',
  francese: 'fr',
  franzosisch: 'fr',
  german: 'de',
  deutsch: 'de',
  allemand: 'de',
  aleman: 'de',
  tedesco: 'de',
  spanish: 'es',
  castilian: 'es',
  espanol: 'es',
  castellano: 'es',
  espagnol: 'es',
  spagnolo: 'es',
  spanisch: 'es',
  italian: 'it',
  italiano: 'it',
  italien: 'it',
  italienisch: 'it',
  portuguese: 'pt',
  portugues: 'pt',
  portugais: 'pt',
  dutch: 'nl',
  nederlands: 'nl',
  neerlandais: 'nl',
  russian: 'ru',
  russe: 'ru',
  swedish: 'sv',
  svenska: 'sv',
  suedois: 'sv',
  polish: 'pl',
  polski: 'pl',
  polonais: 'pl',
  czech: 'cs',
  cestina: 'cs',
  tcheque: 'cs',
  japanese: 'ja',
  japonais: 'ja',
  chinese: 'zh',
  chinois: 'zh',
  // Names of other languages seen on IFDB, so that a description naming one of them is not read as naming another.
  slovak: 'sk',
  slovenian: 'sl',
  ukrainian: 'uk',
  belarusian: 'be',
  hungarian: 'hu',
  greek: 'el',
  turkish: 'tr',
  esperanto: 'eo',
  catalan: 'ca',
  galician: 'gl',
  basque: 'eu',
  korean: 'ko',
  finnish: 'fi',
  danish: 'da',
  norwegian: 'no',
  romanian: 'ro',
  hebrew: 'he',
  arabic: 'ar',
};

/** Lower case without accents: `Français` → `francais`. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Primary language subtag of IFDB's language field: `en-US` → `en`, `fr` → `fr`. IFDB gives the whole field when it
 * has no code in brackets (e.g. `English`), so common language names are mapped too. Several languages: the first.
 */
export function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const whole = value.trim().toLowerCase();
  // Several languages keep their codes together at the end: `Castilian, English (es, en)`.
  const bracketed = /\(([a-z]{2,3})(?:-[a-z0-9]+)*(?:\s*,[^)]*)?\)$/.exec(whole);
  if (bracketed) return bracketed[1];
  const first = whole.split(/[,;/]/)[0].trim();
  const code = /^([a-z]{2,3})(?:[-_][a-z0-9]+)*$/.exec(first);
  if (code && !LANGUAGE_NAMES[first]) return code[1];
  return LANGUAGE_NAMES[plain(first.replace(/\s*\(.*\)$/, ''))];
}

/**
 * Every language of IFDB's language field, as primary subtags in IFDB's order: `French, English (fr, en)` →
 * `['fr', 'en']`. Unknown names are left out.
 */
export function languagesOf(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const whole = value.trim().toLowerCase();
  const bracketed = /\(([^()]*)\)$/.exec(whole);
  const codes = bracketed ? bracketed[1].split(',') : [];
  const parts =
    codes.length && codes.every((code) => /^\s*[a-z]{2,3}(?:-[a-z0-9]+)*\s*$/.test(code))
      ? codes
      : whole.split(/[,;/]/);
  return unique(
    parts
      .map((part) => normalizeLanguage(part))
      .filter((code): code is string => code !== undefined),
  );
}

const ONLY_AFTER = '(?:only|seulement|uniquement|solamente|soltanto|nur)';
const ONLY_BEFORE = '(?:only in|seulement en|uniquement en|solo en|solo in|nur auf)';

/**
 * The language a file's description says it is limited to (`English only`, `(English only.)`,
 * `en français seulement`, `only in French`…), when that language is one of `languages` and the only one named so.
 */
export function onlyLanguage(description: string, languages: string[]): string | undefined {
  const text = plain(decodeEntities(description));
  const found: string[] = [];
  for (const name of Object.keys(LANGUAGE_NAMES)) {
    const after = new RegExp('(?:^|[^a-z])' + name + '\\s+' + ONLY_AFTER + '(?![a-z])');
    const before = new RegExp('(?:^|[^a-z])' + ONLY_BEFORE + '\\s+' + name + '(?![a-z])');
    if (after.test(text) || before.test(text)) found.push(LANGUAGE_NAMES[name]);
  }
  const named = unique(found);
  return named.length === 1 && languages.indexOf(named[0]) >= 0 ? named[0] : undefined;
}

/** Words that tell a description is written in a language without naming it ("Traducido por …"). */
const LANGUAGE_WORDS: Record<string, string> = {
  traducido: 'es',
  traduccion: 'es',
  traduit: 'fr',
  traduction: 'fr',
  ubersetzt: 'de',
  ubersetzung: 'de',
  tradotto: 'it',
  traduzione: 'it',
};

/** Language tags in file names (`hs_eng.z5`, `baron_EN.z8`, `Lux PL.html`): ISO 639-1 and common 3-letter forms. */
const FILE_NAME_CODES: Record<string, string> = {
  en: 'en',
  eng: 'en',
  fr: 'fr',
  fra: 'fr',
  fre: 'fr',
  es: 'es',
  esp: 'es',
  spa: 'es',
  it: 'it',
  ita: 'it',
  de: 'de',
  deu: 'de',
  ger: 'de',
  nl: 'nl',
  nld: 'nl',
  dut: 'nl',
  pt: 'pt',
  por: 'pt',
  ru: 'ru',
  rus: 'ru',
  pl: 'pl',
  pol: 'pl',
  sv: 'sv',
  swe: 'sv',
  cs: 'cs',
  cze: 'cs',
  uk: 'uk',
  ukr: 'uk',
  sk: 'sk',
  slk: 'sk',
  ja: 'ja',
  jpn: 'ja',
  zh: 'zh',
  chi: 'zh',
  zho: 'zh',
};

/**
 * The languages a description names, from language names and translation words (`Spanish version`,
 * `Traducido por …`), leaving out a language a story was translated *from* (`Translated from Spanish`).
 */
function namedLanguages(description: string): string[] {
  const text = plain(decodeEntities(description));
  const found: string[] = [];
  const words: Record<string, string> = { ...LANGUAGE_NAMES, ...LANGUAGE_WORDS };
  for (const word of Object.keys(words)) {
    const pattern = new RegExp('(^|[^a-z])(from\\s+)?' + word + '(?![a-z])', 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if (!match[2]) found.push(words[word]);
    }
  }
  return unique(found);
}

/** The language a file name is tagged with, among `languages`. */
function fileNameLanguage(path: string, languages: string[]): string | undefined {
  let name = path.split(/[?#]/)[0].split('/').pop() || '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // Keep the name as it is.
  }
  const tokens = name
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .split(/[^a-z0-9]+/)
    .slice(1);
  const found = unique(
    tokens
      .map((token) => FILE_NAME_CODES[token])
      .filter((code) => !!code && languages.indexOf(code) >= 0),
  );
  return found.length === 1 ? found[0] : undefined;
}

/**
 * The language of one download of a game in `languages` (S2.6), when IFDB says it: its description names one of them
 * "only" (`(English only.)`), or names a single language (`Spanish version`, `IFComp 2005 version (English)`,
 * `Traducido por …`); without any language in its description, its file name may carry a language tag
 * (`hs_ita.z5`). A language the game does not list is ignored.
 */
export function fileLanguage(
  link: { url: string; desc?: string; compressedPrimary?: string },
  languages: string[],
): string | undefined {
  const desc = link.desc || '';
  const only = onlyLanguage(desc, languages);
  if (only) return only;
  if (/(^|[^a-z])(bilingual|bilingue|multilingual|both)(?![a-z])/.test(plain(desc)))
    return undefined;
  const named = namedLanguages(desc);
  if (named.length)
    return named.length === 1 && languages.indexOf(named[0]) >= 0 ? named[0] : undefined;
  return fileNameLanguage(link.compressedPrimary || link.url, languages);
}

/** A file of a game for one of its languages. */
export interface LanguageVersion {
  language: string;
  file: StoryFile;
}

/** How a game's language and its files per language were found (S2.6). */
export interface LanguagePlan {
  /** The file played by default, and its language. */
  main: Candidate;
  language: string;
  /** IFDB said the main file's language (in its description or name); otherwise it is assumed. */
  read: boolean;
  /** Files in the game's other languages, in IFDB's order of languages. */
  versions: Array<{ language: string; file: Candidate }>;
}

/**
 * For a game IFDB lists in several `languages`: the language of each usable file (`fileLanguage`), the best file of
 * each language (files in order of preference), and the main file. A file of unknown language stands for the first
 * language without a file of its own. The chosen file stays the main one when its language is known; otherwise the
 * best file in IFDB's first language replaces it.
 */
export function planLanguages(
  files: Candidate[],
  languages: string[],
  links: Array<{ url: string; desc?: string; compressedPrimary?: string }>,
): LanguagePlan {
  const byLanguage: Record<string, Candidate> = {};
  const read: Record<string, boolean> = {};
  let unknown: Candidate | undefined;
  for (const file of files) {
    const language = fileLanguage(links[file.index], languages);
    if (language) {
      if (!byLanguage[language]) {
        byLanguage[language] = file;
        read[language] = true;
      }
    } else if (!unknown) {
      unknown = file;
    }
  }
  const missing = languages.filter((language) => !byLanguage[language]);
  if (unknown && missing.length) byLanguage[missing[0]] = unknown;
  const ordered = languages.filter((language) => !!byLanguage[language]);
  let language = ordered.filter((code) => byLanguage[code] === files[0])[0];
  if (!language) language = ordered.length ? ordered[0] : languages[0];
  const main = byLanguage[language] || files[0];
  return {
    main: main,
    language: language,
    read: !!read[language],
    versions: ordered
      .filter((code) => code !== language)
      .map((code) => ({ language: code, file: byLanguage[code] })),
  };
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/**
 * Plain text of an IFDB text field: IFDB HTML-escapes titles and authors in its JSON (`Lock &amp; Key`,
 * `&quot;Calm, Mute, Moving&quot;`). Named entities above and numeric ones are decoded; others are left as they are.
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
    if (name.charAt(0) === '#') {
      const code =
        name.charAt(1).toLowerCase() === 'x'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : entity;
    }
    const decoded = ENTITIES[name.toLowerCase()];
    return decoded === undefined ? entity : decoded;
  });
}

/** IFDB genres are free text, sometimes several (`Fantasy / Humor`, `Horror, Mystery`). */
export function normalizeGenres(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return unique(
    value
      .split(/\s*[/,;|]\s*/)
      .map((genre) => genre.trim())
      .filter((genre) => genre.length > 0),
  );
}

export function yearOf(value: unknown): number | undefined {
  const match = typeof value === 'string' ? /^(\d{4})/.exec(value) : null;
  return match ? Number(match[1]) : undefined;
}

function tagNames(record: GameRecord): string[] {
  const tags = record.ifdb.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) =>
      tag && typeof tag === 'object' ? String((tag as { name?: unknown }).name || '') : '',
    )
    .filter((name) => name.length > 0);
}

/** Why the content policy leaves a game out, if it does. The manual exclude list applies to every policy. */
export function policyReason(
  tuid: string,
  tags: string[],
  policy: ContentPolicy,
  config: ContentPolicyConfig,
): { reason: DropReason; detail: string } | undefined {
  const excluded = config.exclude.filter((entry) => entry.tuid === tuid)[0];
  if (excluded) return { reason: 'excluded', detail: excluded.reason };
  if (policy === 'adult') return undefined;
  const deny = config.denyTags.map((tag) => tag.toLowerCase());
  const hit = tags.filter((tag) => deny.indexOf(tag.toLowerCase()) >= 0)[0];
  return hit ? { reason: 'adult-content', detail: hit } : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && isFinite(n) ? n : undefined;
}

function resolveGame(game: RawGame, file: Candidate, tags: string[]): ResolvedGame {
  const record = game.record;
  const bib = (record.bibliographic || {}) as Record<string, unknown>;
  const ifdb = record.ifdb as Record<string, unknown>;
  const search = game.search;
  const resolved: ResolvedGame = {
    tuid: game.tuid,
    title: decodeEntities(str(bib.title) || search.title),
    author: decodeEntities(str(bib.author) || search.author),
    genres: normalizeGenres(typeof bib.genre === 'string' ? decodeEntities(bib.genre) : bib.genre),
    format: file.format,
    file: file.file,
    ifids: (record.identification && record.identification.ifids) || [],
    tags: tags,
    slow: false,
    devsys: search.devsys || '',
    ifdbLink: str(ifdb.link) || search.link,
  };
  const year = yearOf(bib.firstpublished) ?? yearOf(search.published && search.published.machine);
  if (year !== undefined) resolved.year = year;
  const language = normalizeLanguage(bib.language);
  if (language) resolved.language = language;
  const average = num(ifdb.averageRating);
  const count = num(ifdb.ratingCountAvg) ?? num(search.numRatings);
  if (average !== undefined && count) {
    resolved.rating = {
      average: average,
      stars: num(ifdb.starRating) ?? Math.round(average * 2) / 2,
      count: count,
    };
  }
  const starSort = num(search.starSort);
  if (starSort !== undefined) resolved.starSort = starSort;
  const playtime = num(ifdb.playTimeInMinutes) ?? num(search.playTimeInMinutes);
  if (playtime) resolved.playtimeMinutes = playtime;
  const cover = ifdb.coverart as { url?: unknown } | undefined;
  if (cover && str(cover.url)) resolved.cover = cover.url as string;
  const description = str(bib.description);
  if (description) resolved.description = description;
  return resolved;
}

/** Keeps the playable games allowed by the content policy; every other game is listed with its reason. */
export function resolve(dataset: RawDataset, options: ResolveOptions): Resolution {
  const result: Resolution = {
    policy: options.policy,
    enabledFormats: options.enabledFormats,
    games: [],
    dropped: [],
    counts: {
      kept: 0,
      dropped: {},
      formats: {},
      pictures: { blorbs: 0, inspected: 0, illustrated: 0 },
    },
    languages: { changed: [], versions: [], assumed: 0, unknownOverrides: [] },
  };
  const overrides = options.config.languages || {};
  const overridden: string[] = [];
  const drop = (game: RawGame, reason: DropReason, detail?: string) => {
    const entry: Dropped = { tuid: game.tuid, title: game.search.title, reason: reason };
    if (detail) entry.detail = detail;
    result.dropped.push(entry);
    result.counts.dropped[reason] = (result.counts.dropped[reason] || 0) + 1;
  };

  for (const game of dataset.games) {
    const tags = tagNames(game.record).map(decodeEntities);
    const blocked = policyReason(game.tuid, tags, options.policy, options.config);
    if (blocked) {
      drop(game, blocked.reason, blocked.detail);
      continue;
    }
    const choice = chooseFile(
      game.record,
      game.search.devsys || '',
      ALL_FORMATS,
      undefined,
      options.inkStory,
    );
    if ('reason' in choice) {
      drop(game, choice.reason, choice.detail);
      continue;
    }
    result.counts.formats[choice.file.format] =
      (result.counts.formats[choice.file.format] || 0) + 1;
    const enabledChoice = chooseFile(
      game.record,
      game.search.devsys || '',
      options.enabledFormats,
      options.readable,
      options.inkStory,
    );
    if ('reason' in enabledChoice) {
      drop(game, enabledChoice.reason, enabledChoice.detail);
      continue;
    }
    const links = ((game.record.ifdb.downloads && game.record.ifdb.downloads.links) ||
      []) as Link[];
    const bib = (game.record.bibliographic || {}) as Record<string, unknown>;
    const languages = languagesOf(bib.language);
    const readable = options.readable;
    const plan =
      languages.length > 1
        ? planLanguages(
            [enabledChoice.file].concat(
              enabledChoice.others.filter((c) => c.onArchive || !readable || readable(c.file.url)),
            ),
            languages,
            links,
          )
        : undefined;
    const resolved = resolveGame(game, plan ? plan.main : enabledChoice.file, tags);
    let change: Omit<LanguageChange, 'tuid' | 'title'> | undefined;
    if (plan) {
      resolved.language = plan.language;
      if (plan.versions.length) {
        resolved.versions = plan.versions.map((v) => ({ language: v.language, file: v.file.file }));
      }
      if (!plan.read) result.languages.assumed++;
      const moved = plan.main !== enabledChoice.file;
      if (plan.language !== languages[0] || moved) {
        change = {
          from: languages[0],
          to: plan.language,
          source: 'file',
          detail: plan.main.desc || plan.main.file.archive?.primary || plan.main.file.url,
        };
        if (moved) change.file = plan.main.file.url;
      }
    }
    const override = overrides[game.tuid];
    if (override) {
      overridden.push(game.tuid);
      change = {
        from: languages[0] || resolved.language,
        to: override.language,
        source: 'override',
        detail: override.reason,
      };
      resolved.language = override.language;
      if (resolved.versions) {
        resolved.versions = resolved.versions.filter((v) => v.language !== override.language);
        if (!resolved.versions.length) delete resolved.versions;
      }
    }
    if (change) {
      const entry: LanguageChange = { tuid: game.tuid, title: resolved.title, ...change };
      if (entry.from === undefined) delete entry.from;
      result.languages.changed.push(entry);
    }
    if (resolved.versions) {
      result.languages.versions.push({
        tuid: game.tuid,
        title: resolved.title,
        languages: [resolved.language as string].concat(resolved.versions.map((v) => v.language)),
      });
    }
    if (isCandidate(resolved)) {
      const counts = result.counts.pictures;
      counts.blorbs++;
      const pictures = options.pictures ? options.pictures(resolved.file.url) : undefined;
      if (pictures !== undefined) counts.inspected++;
      if (pictures !== undefined && pictures >= MIN_PICTURES) {
        resolved.illustrated = true;
        resolved.pictures = pictures;
        counts.illustrated++;
      }
    }
    result.games.push(resolved);
  }
  result.counts.kept = result.games.length;
  result.languages.unknownOverrides = Object.keys(overrides).filter(
    (tuid) => overridden.indexOf(tuid) < 0,
  );
  return result;
}
