// Library filters panel (SPEC §3.4; story S3.2). It replaces the results while open (`panel` in the hash): a page
// listing the sort and each filter with its current value, and a page of choices per filter. Choices apply at once,
// replacing the current history entry, so "Show n adventures" goes back to the results with them and the back
// button leaves the panel as it found the results.
import { useState } from 'preact/hooks';
import type { VNode } from 'preact';
import type { Catalog } from '../../catalog/loader';
import {
  activeCount,
  countBy,
  facetOptions,
  FORGIVENESS,
  formatName,
  genreOptions,
  languageName,
  MIN_RATINGS,
  MIN_VOTES,
  NO_FILTERS,
  PLAY_TIMES,
  playTime,
  SORTS,
  type FacetOption,
  type Filters,
  type PlayTime,
  type SortKey,
} from '../../catalog/filters';
import { RESULT_ROW_HEIGHT } from '../../catalog/layout';
import { paginate } from '../../catalog/search';
import { t, type MessageKey } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { Pager } from '../../ui/Pager';
import { useArea } from './useArea';

export type PanelName =
  'filters' | 'sort' | 'genre' | 'lang' | 'format' | 'rating' | 'votes' | 'time' | 'fg' | 'year';

const PANELS: PanelName[] = [
  'filters',
  'sort',
  'genre',
  'lang',
  'format',
  'rating',
  'votes',
  'time',
  'fg',
  'year',
];

export function parsePanel(value: string | undefined): PanelName | undefined {
  return PANELS.indexOf(value as PanelName) >= 0 ? (value as PanelName) : undefined;
}

export interface PanelChange {
  filters?: Filters;
  sort?: SortKey;
  /** Undefined closes the panel. */
  panel?: PanelName;
}

interface Props {
  panel: PanelName;
  catalog: Catalog;
  filters: Filters;
  sort: SortKey;
  /** Results with the current filters. */
  count: number;
  /** Replaces the current entry with this state (the panel stays open unless `panel` is left out). */
  go: (change: PanelChange) => void;
}

const TITLES: Record<PanelName, MessageKey> = {
  filters: 'filters.title',
  sort: 'filters.sort',
  genre: 'filters.genre',
  lang: 'filters.language',
  format: 'filters.format',
  rating: 'filters.rating',
  votes: 'filters.votes',
  time: 'filters.time',
  fg: 'filters.forgiveness',
  year: 'filters.year',
};

const SORT_LABELS: Record<SortKey, MessageKey> = {
  rating: 'sort.rating',
  votes: 'sort.votes',
  new: 'sort.new',
  title: 'sort.title',
};

const TIME_LABELS: Record<PlayTime, MessageKey> = {
  short: 'filters.time.short',
  medium: 'filters.time.medium',
  long: 'filters.time.long',
  epic: 'filters.time.epic',
};

function forgivenessLabel(value: string): string {
  return t(('filters.fg.' + value) as MessageKey);
}

function languageLabel(code: string): string {
  return languageName(code) || t('filters.unknownLanguage');
}

function starsLabel(value: number): string {
  return t('filters.stars', { value: value });
}

function votesLabel(value: number): string {
  return t('filters.votesAtLeast', { count: value });
}

function toggle<T>(values: T[], value: T): T[] {
  return values.indexOf(value) >= 0 ? values.filter((v) => v !== value) : values.concat([value]);
}

function toggleGenre(values: string[], value: string): string[] {
  const key = value.toLowerCase();
  const kept = values.filter((v) => v.toLowerCase() !== key);
  return kept.length < values.length ? kept : values.concat([value]);
}

interface Choice {
  label: string;
  count?: number;
  selected: boolean;
  onSelect: () => void;
}

/** One choice: a full-width button, pressed when selected; `round` marks a single choice (radio-like). */
function ChoiceRow({ choice, round }: { choice: Choice; round?: boolean }) {
  return (
    <li>
      <button
        type="button"
        class="choice"
        aria-pressed={choice.selected ? 'true' : 'false'}
        onClick={choice.onSelect}
      >
        <span
          class={
            'choice__mark' +
            (round ? ' choice__mark--round' : '') +
            (choice.selected ? ' choice__mark--on' : '')
          }
          aria-hidden="true"
        />
        <span class="choice__label">{choice.label}</span>
        {choice.count !== undefined && <span class="choice__count">{choice.count}</span>}
      </button>
    </li>
  );
}

/**
 * The rows of a panel page: as many as fit, paged with buttons (no history entry per page). Until paged by hand, it
 * shows the page holding the row keyed `focus` (the filter just edited), whatever the measured page size.
 */
function Rows({ rows, focus }: { rows: VNode[]; focus?: string }) {
  const [area, listRef] = useArea();
  const [page, setPage] = useState<number | null>(null);
  const perPage = Math.max(3, Math.floor(area.height / RESULT_ROW_HEIGHT));
  let focused = 0;
  for (let i = 0; i < rows.length; i++) if (focus && rows[i].key === focus) focused = i;
  const shown = paginate(rows, page === null ? Math.floor(focused / perPage) + 1 : page, perPage);
  return (
    <>
      <div class="filters__list" ref={listRef}>
        <ul class="choices">{shown.items}</ul>
      </div>
      <Pager page={shown.page} pageCount={shown.pageCount} onPage={setPage} />
    </>
  );
}

/** A filter on the first page: its name and current value; opens its page of choices. */
function SectionRow({
  label,
  value,
  onOpen,
}: {
  label: string;
  value: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button type="button" class="choice choice--section" onClick={onOpen}>
        <span class="choice__label">{label}</span>
        <span class="choice__value">{value}</span>
        <span class="choice__chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

function YearForm({ filters, go }: { filters: Filters; go: Props['go'] }) {
  const [from, setFrom] = useState(filters.from === undefined ? '' : String(filters.from));
  const [to, setTo] = useState(filters.to === undefined ? '' : String(filters.to));
  const read = (value: string) => {
    const n = parseInt(value, 10);
    return n >= 1000 && n <= 9999 ? n : undefined;
  };
  return (
    <form
      class="filters__year"
      onSubmit={(event) => {
        event.preventDefault();
        let first = read(from);
        let last = read(to);
        if (first !== undefined && last !== undefined && first > last) {
          const swap = first;
          first = last;
          last = swap;
        }
        go({ filters: { ...filters, from: first, to: last }, panel: 'filters' });
      }}
    >
      <label class="filters__field">
        <span>{t('filters.yearFrom')}</span>
        <input
          class="search__input"
          type="number"
          inputMode="numeric"
          min={1970}
          max={2100}
          value={from}
          onInput={(event) => setFrom((event.target as HTMLInputElement).value)}
        />
      </label>
      <label class="filters__field">
        <span>{t('filters.yearTo')}</span>
        <input
          class="search__input"
          type="number"
          inputMode="numeric"
          min={1970}
          max={2100}
          value={to}
          onInput={(event) => setTo((event.target as HTMLInputElement).value)}
        />
      </label>
      <div class="filters__actions">
        <Button
          variant="secondary"
          onClick={() =>
            go({ filters: { ...filters, from: undefined, to: undefined }, panel: 'filters' })
          }
        >
          {t('filters.anyYear')}
        </Button>
        <Button type="submit">{t('filters.apply')}</Button>
      </div>
    </form>
  );
}

function yearValue(filters: Filters): string | undefined {
  if (filters.from === undefined && filters.to === undefined) return undefined;
  return (
    (filters.from === undefined ? '' : filters.from) +
    '–' +
    (filters.to === undefined ? '' : filters.to)
  );
}

export function FiltersPanel({ panel, catalog, filters, sort, count, go }: Props) {
  // The filter whose page was opened last, to come back to its row.
  const [focus, setFocus] = useState<PanelName | undefined>(undefined);
  const rows = catalog.rows;
  const meta = catalog.meta;
  // Several choices can be ticked on a page; picking a single choice goes back to the filters.
  const set = (next: Partial<Filters>) => go({ filters: { ...filters, ...next }, panel: panel });
  const pick = (next: Partial<Filters>) =>
    go({ filters: { ...filters, ...next }, panel: 'filters' });
  const any = t('filters.any');
  const join = (labels: string[]) => (labels.length ? labels.join(', ') : any);
  const hasForgiveness = rows.some((row) => !!row.fg);

  let content: VNode;
  if (panel === 'year') {
    content = <YearForm filters={filters} go={go} />;
  } else if (panel === 'filters') {
    const open = (name: PanelName) => () => {
      setFocus(name);
      go({ panel: name });
    };
    const sections: VNode[] = [
      <SectionRow
        key="sort"
        label={t('filters.sort')}
        value={t(SORT_LABELS[sort])}
        onOpen={open('sort')}
      />,
      <ChoiceRow
        key="start"
        choice={{
          label: t('filters.start'),
          count: rows.filter((row) => !!row.st).length,
          selected: filters.starter,
          onSelect: () => set({ starter: !filters.starter }),
        }}
      />,
      <SectionRow
        key="genre"
        label={t('filters.genre')}
        value={join(filters.genres)}
        onOpen={open('genre')}
      />,
      <SectionRow
        key="lang"
        label={t('filters.language')}
        value={join(filters.languages.map(languageLabel))}
        onOpen={open('lang')}
      />,
      <SectionRow
        key="format"
        label={t('filters.format')}
        value={join(filters.formats.map(formatName))}
        onOpen={open('format')}
      />,
      <SectionRow
        key="rating"
        label={t('filters.rating')}
        value={filters.minRating === undefined ? any : starsLabel(filters.minRating)}
        onOpen={open('rating')}
      />,
      <SectionRow
        key="votes"
        label={t('filters.votes')}
        value={filters.minVotes === undefined ? any : votesLabel(filters.minVotes)}
        onOpen={open('votes')}
      />,
      <SectionRow
        key="time"
        label={t('filters.time')}
        value={join(filters.times.map((time) => t(TIME_LABELS[time])))}
        onOpen={open('time')}
      />,
    ];
    // IFDB's JSON API has no forgiveness yet: the filter shows once the index carries it.
    if (hasForgiveness || filters.forgiveness.length) {
      sections.push(
        <SectionRow
          key="fg"
          label={t('filters.forgiveness')}
          value={join(filters.forgiveness.map(forgivenessLabel))}
          onOpen={open('fg')}
        />,
      );
    }
    sections.push(
      <SectionRow
        key="year"
        label={t('filters.year')}
        value={yearValue(filters) || any}
        onOpen={open('year')}
      />,
    );
    content = <Rows key={panel} rows={sections} focus={focus} />;
  } else {
    let choices: Choice[] = [];
    let single = false;
    const multi = (
      options: FacetOption[],
      selected: string[],
      label: (value: string) => string,
      pick: (value: string) => void,
    ) =>
      options.map((option) => ({
        label: label(option.value),
        count: option.count,
        selected: selected.indexOf(option.value) >= 0,
        onSelect: () => pick(option.value),
      }));
    const anyChoice = (selected: boolean, clear: Partial<Filters>): Choice => ({
      label: any,
      selected: selected,
      onSelect: () => pick(clear),
    });

    switch (panel) {
      case 'sort':
        single = true;
        choices = SORTS.map((key) => ({
          label: t(SORT_LABELS[key]),
          selected: key === sort,
          onSelect: () => go({ sort: key, panel: 'filters' }),
        }));
        break;
      case 'genre': {
        const selected = filters.genres.map((genre) => genre.toLowerCase());
        choices = [anyChoice(!filters.genres.length, { genres: [] })].concat(
          genreOptions(meta).map((option) => ({
            label: option.value,
            count: option.count,
            selected: selected.indexOf(option.value.toLowerCase()) >= 0,
            onSelect: () => set({ genres: toggleGenre(filters.genres, option.value) }),
          })),
        );
        break;
      }
      case 'lang':
        choices = [anyChoice(!filters.languages.length, { languages: [] })].concat(
          multi(facetOptions(meta.facets.languages), filters.languages, languageLabel, (value) =>
            set({ languages: toggle(filters.languages, value) }),
          ),
        );
        break;
      case 'format':
        choices = [anyChoice(!filters.formats.length, { formats: [] })].concat(
          multi(facetOptions(meta.facets.formats), filters.formats, formatName, (value) =>
            set({ formats: toggle(filters.formats, value) }),
          ),
        );
        break;
      case 'rating': {
        single = true;
        const counts = countBy(
          rows,
          MIN_RATINGS,
          (row, min) => row.r !== undefined && row.r >= min,
        );
        choices = [anyChoice(filters.minRating === undefined, { minRating: undefined })].concat(
          MIN_RATINGS.map((min, i) => ({
            label: starsLabel(min),
            count: counts[i],
            selected: filters.minRating === min,
            onSelect: () => pick({ minRating: min }),
          })),
        );
        break;
      }
      case 'votes': {
        single = true;
        const counts = countBy(rows, MIN_VOTES, (row, min) => (row.rc || 0) >= min);
        choices = [anyChoice(filters.minVotes === undefined, { minVotes: undefined })].concat(
          MIN_VOTES.map((min, i) => ({
            label: votesLabel(min),
            count: counts[i],
            selected: filters.minVotes === min,
            onSelect: () => pick({ minVotes: min }),
          })),
        );
        break;
      }
      case 'time': {
        const counts = countBy(
          rows,
          PLAY_TIMES,
          (row, time) => !!row.p && playTime(row.p) === time,
        );
        choices = [anyChoice(!filters.times.length, { times: [] })].concat(
          PLAY_TIMES.map((time, i) => ({
            label: t(TIME_LABELS[time]),
            count: counts[i],
            selected: filters.times.indexOf(time) >= 0,
            onSelect: () => set({ times: toggle(filters.times, time) }),
          })),
        );
        break;
      }
      case 'fg': {
        const counts = countBy(
          rows,
          FORGIVENESS,
          (row, value) => !!row.fg && row.fg.toLowerCase() === value,
        );
        choices = [anyChoice(!filters.forgiveness.length, { forgiveness: [] })].concat(
          FORGIVENESS.map((value, i) => ({
            label: forgivenessLabel(value),
            count: counts[i],
            selected: filters.forgiveness.indexOf(value) >= 0,
            onSelect: () => set({ forgiveness: toggle(filters.forgiveness, value) }),
          })),
        );
        break;
      }
    }
    content = (
      <Rows
        key={panel}
        rows={choices.map((choice, i) => (
          <ChoiceRow key={String(i)} choice={choice} round={single} />
        ))}
      />
    );
  }

  const cleared = NO_FILTERS;
  return (
    <div class="screen library filters">
      <div class="filters__head">
        {panel !== 'filters' && (
          <button type="button" class="filters__back" onClick={() => go({ panel: 'filters' })}>
            {'‹ ' + t('filters.title')}
          </button>
        )}
        <h1 class="screen__title filters__title">{t(TITLES[panel])}</h1>
      </div>
      {content}
      {/* The year page has its own Apply: showing the results there would drop what was typed. */}
      {panel !== 'year' && (
        <div class="filters__actions">
          {panel === 'filters' && activeCount(filters) > 0 && (
            <Button variant="secondary" onClick={() => go({ filters: cleared, panel: 'filters' })}>
              {t('library.clearFilters')}
            </Button>
          )}
          <Button onClick={() => go({})}>{t('filters.show', { count: count })}</Button>
        </div>
      )}
    </div>
  );
}
