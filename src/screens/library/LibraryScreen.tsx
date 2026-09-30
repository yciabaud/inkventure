import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatHash, type Query } from '../../app/router';
import { loadCatalog, type Catalog, type IndexRow } from '../../catalog/loader';
import { paginate, search } from '../../catalog/search';
import { formatNumber, t, useLocale } from '../../i18n/i18n';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Pager } from '../../ui/Pager';

/** Height of a result row in px (`.result` in ui.css): the list shows as many as fit, no scrolling. */
export const RESULT_ROW_HEIGHT = 56;
/** Before the list is measured (and in jsdom). */
const DEFAULT_PER_PAGE = 10;

const FORMAT_NAMES: Record<string, string> = {
  zcode: 'Z-code',
  glulx: 'Glulx',
  twine: 'Twine',
  ink: 'ink',
};

/** IFDB cover thumbnail (SPEC §5.6: always a thumbnail, never the full-size image). */
export function thumbnailUrl(tuid: string): string {
  return 'https://ifdb.org/coverart?id=' + encodeURIComponent(tuid) + '&thumbnail=36x48';
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

/** Rows that fit in the list area (measured, and again on resize), so a page never scrolls. */
function useRowsPerPage(): [number, RefObject<HTMLDivElement>] {
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [, setTick] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  // After every render: the list shrinks when the pager appears. Setting the same value does not re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const height = list.current ? list.current.clientHeight : 0;
    if (height > 0) setPerPage(Math.max(3, Math.floor(height / RESULT_ROW_HEIGHT)));
  });
  useEffect(() => {
    const remeasure = () => setTick((tick) => tick + 1);
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);
  return [perPage, list];
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
      src={thumbnailUrl(row.t)}
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
      <a class="result" href={formatHash({ name: 'game', tuid: row.t })}>
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
  const [perPage, listRef] = useRowsPerPage();
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
      <p class="library__count">
        {catalog ? t('library.count', { count: matches.length }) : '\u00a0'}
      </p>
      <div class="library__list" ref={listRef}>
        {body}
      </div>
      {catalog && (
        <Pager page={page.page} pageCount={page.pageCount} hrefFor={(n) => libraryHash(q, n)} />
      )}
    </div>
  );
}
