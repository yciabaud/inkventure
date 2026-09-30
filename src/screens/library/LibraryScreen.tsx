import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatHash, type Query } from '../../app/router';
import { gridLayout, listPerPage, type GridLayout } from '../../catalog/layout';
import { loadCatalog, type Catalog, type IndexRow } from '../../catalog/loader';
import { paginate, search } from '../../catalog/search';
import { formatNumber, t, useLocale } from '../../i18n/i18n';
import { getPrefs, getStore, setPrefs } from '../../storage';
import { Button } from '../../ui/Button';
import { Cover } from '../../ui/Cover';
import { EmptyState } from '../../ui/EmptyState';
import { Pager } from '../../ui/Pager';

export type LibraryView = 'grid' | 'list';

/** Before the list area is measured (and in jsdom). */
const DEFAULT_AREA = { width: 568, height: 480 };

const FORMAT_NAMES: Record<string, string> = {
  zcode: 'Z-code',
  glulx: 'Glulx',
  twine: 'Twine',
  ink: 'ink',
};

/**
 * IFDB cover thumbnail (SPEC §5.6: always a thumbnail, never the full-size image), rounded up to 10 px steps so
 * nearby sizes share cached images.
 */
export function thumbnailUrl(tuid: string, width: number, height: number): string {
  const up = (n: number) => Math.ceil(n / 10) * 10;
  return (
    'https://ifdb.org/coverart?id=' +
    encodeURIComponent(tuid) +
    '&thumbnail=' +
    up(width) +
    'x' +
    up(height)
  );
}

type CatalogState =
  | { status: 'loading'; loaded: number; total: number }
  | { status: 'ready'; catalog: Catalog }
  | { status: 'error' };

function useCatalog(): [CatalogState, () => void] {
  const [state, setState] = useState<CatalogState>({ status: 'loading', loaded: 0, total: 0 });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading', loaded: 0, total: 0 });
    loadCatalog((loaded, total) => {
      if (live) setState({ status: 'loading', loaded: loaded, total: total });
    }).then(
      (catalog) => live && setState({ status: 'ready', catalog: catalog }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return [state, () => setAttempt((n) => n + 1)];
}

/** Size of the list area, measured after every render (it shrinks when the pager appears) and on resize. */
function useArea(): [{ width: number; height: number }, RefObject<HTMLDivElement>] {
  const [area, setArea] = useState(DEFAULT_AREA);
  const [, setTick] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = list.current;
    if (!element || !element.clientHeight) return;
    if (element.clientWidth !== area.width || element.clientHeight !== area.height) {
      setArea({ width: element.clientWidth, height: element.clientHeight });
    }
  });
  useEffect(() => {
    const remeasure = () => setTick((tick) => tick + 1);
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);
  return [area, list];
}

/** Grid (Kindle-like covers, the default) or list, remembered in the preferences. */
function useView(): [LibraryView, (view: LibraryView) => void] {
  const [view, setView] = useState<LibraryView>(() => getPrefs(getStore()).libraryView || 'grid');
  return [
    view,
    (next) => {
      setPrefs(getStore(), { libraryView: next });
      setView(next);
    },
  ];
}

function libraryHash(q: string, page?: number): string {
  const query: Query = {};
  if (q) query.q = q;
  if (page && page > 1) query.page = String(page);
  return formatHash({ name: 'library' }, query);
}

function playtime(minutes: number): string {
  if (minutes < 60) return t('library.minutes', { count: minutes });
  return t('library.hours', { count: Math.round(minutes / 60) });
}

function label(row: IndexRow): string {
  return row.a ? row.n + ', ' + row.a : row.n;
}

function Tile({ row, layout }: { row: IndexRow; layout: GridLayout }) {
  return (
    <li>
      <a class="tile" href={formatHash({ name: 'game', tuid: row.t })} aria-label={label(row)}>
        <Cover
          title={row.n}
          author={row.a}
          width={layout.coverWidth}
          imageUrl={row.c ? thumbnailUrl(row.t, layout.coverWidth, layout.coverHeight) : undefined}
        />
      </a>
    </li>
  );
}

function Thumb({ row }: { row: IndexRow }) {
  const [broken, setBroken] = useState(false);
  if (!row.c || broken) {
    return (
      <span class="result__thumb result__thumb--none" aria-hidden="true">
        {row.n.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      class="result__thumb"
      src={thumbnailUrl(row.t, 36, 48)}
      alt=""
      width={36}
      height={48}
      onError={() => setBroken(true)}
    />
  );
}

function ResultRow({ row }: { row: IndexRow }) {
  const locale = useLocale();
  // One line, most useful first (an ellipsis cuts the end on narrow screens).
  const details: string[] = [row.a + (row.y ? ', ' + row.y : '')];
  if (row.r !== undefined && row.rc) {
    details.push('★ ' + formatNumber(row.r, locale, 1) + ' (' + formatNumber(row.rc, locale) + ')');
  }
  if (row.p) details.push(playtime(row.p));
  details.push(FORMAT_NAMES[row.f] || row.f);
  return (
    <li>
      <a class="result" href={formatHash({ name: 'game', tuid: row.t })} aria-label={label(row)}>
        <Thumb row={row} />
        <span class="result__text">
          <span class="result__title">{row.n}</span>
          <span class="result__line">{details.join(' · ')}</span>
        </span>
      </a>
    </li>
  );
}

function SearchForm({ q }: { q: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      class="search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const value = input.current ? input.current.value.trim() : '';
        location.hash = libraryHash(value);
      }}
    >
      <input
        ref={input}
        key={q}
        class="search__input"
        type="search"
        defaultValue={q}
        placeholder={t('library.searchPlaceholder')}
        aria-label={t('library.search')}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellcheck={false}
      />
      <Button type="submit" variant="secondary">
        {t('library.searchButton')}
      </Button>
      {q && (
        <a class="search__clear" href={libraryHash('')} aria-label={t('library.clear')}>
          ✕
        </a>
      )}
    </form>
  );
}

export function LibraryScreen({ query }: { query: Query }) {
  useLocale();
  const q = query.q || '';
  const [state, retry] = useCatalog();
  const [area, listRef] = useArea();
  const [view, setView] = useView();
  const grid = gridLayout(area.width, area.height);
  const perPage = view === 'grid' ? grid.perPage : listPerPage(area.height);
  const catalog = state.status === 'ready' ? state.catalog : null;
  const matches = useMemo(
    () => (catalog ? search(catalog.rows, catalog.keys, q) : []),
    [catalog, q],
  );
  const page = paginate(matches, parseInt(query.page || '1', 10), perPage);

  let body;
  if (state.status === 'loading') {
    body = (
      <p class="library__status" role="status">
        {state.total
          ? t('library.loadingProgress', { loaded: state.loaded, total: state.total })
          : t('library.loading')}
      </p>
    );
  } else if (state.status === 'error') {
    body = (
      <EmptyState title={t('library.loadFailed')} text={t('library.loadFailedText')}>
        <Button onClick={retry}>{t('library.retry')}</Button>
      </EmptyState>
    );
  } else if (!matches.length) {
    body = (
      <p class="library__status" role="status">
        {t('library.noResults', { query: q })}
      </p>
    );
  } else if (view === 'grid') {
    body = (
      <ol
        class="tiles"
        aria-label={t('library.results')}
        style={{ gridTemplateColumns: 'repeat(' + grid.columns + ', ' + grid.coverWidth + 'px)' }}
      >
        {page.items.map((index) => (
          <Tile key={catalog!.rows[index].t} row={catalog!.rows[index]} layout={grid} />
        ))}
      </ol>
    );
  } else {
    body = (
      <ol class="results" aria-label={t('library.results')}>
        {page.items.map((index) => (
          <ResultRow key={catalog!.rows[index].t} row={catalog!.rows[index]} />
        ))}
      </ol>
    );
  }

  return (
    <div class="screen library">
      <h1 class="screen__title">{t('library.title')}</h1>
      <SearchForm q={q} />
      <div class="library__bar">
        <p class="library__count">
          {catalog ? t('library.count', { count: matches.length }) : '\u00a0'}
        </p>
        <button
          type="button"
          class="library__view"
          onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
        >
          {view === 'grid' ? t('library.viewList') : t('library.viewGrid')}
        </button>
      </div>
      <div class="library__list" ref={listRef}>
        {body}
      </div>
      {catalog && (
        <Pager page={page.page} pageCount={page.pageCount} hrefFor={(n) => libraryHash(q, n)} />
      )}
    </div>
  );
}
