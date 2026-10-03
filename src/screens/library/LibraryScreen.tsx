import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { isOnline } from '../../app/offline';
import { useReadyTiming } from '../../app/perf';
import { formatHash, formatQuery, type Query } from '../../app/router';
import {
  activeCount,
  applyFilters,
  DEFAULT_SORT,
  formatFilters,
  formatName,
  NO_FILTERS,
  parseFilters,
  parseSort,
  sortIndices,
  type Filters,
  type SortKey,
} from '../../catalog/filters';
import { gridLayout, listPerPage, type GridLayout } from '../../catalog/layout';
import { thumbnailUrl } from '../../catalog/game';
import { loadCatalog, type Catalog, type IndexRow } from '../../catalog/loader';
import { paginate, search } from '../../catalog/search';
import { formatNumber, t, useLocale } from '../../i18n/i18n';
import { getPrefs, getStore, setPrefs } from '../../storage';
import { Button } from '../../ui/Button';
import { Cover } from '../../ui/Cover';
import { EmptyState } from '../../ui/EmptyState';
import { Pager } from '../../ui/Pager';
import { FiltersPanel, parsePanel, type PanelChange, type PanelName } from './FiltersPanel';
import { useArea } from './useArea';

export type LibraryView = 'grid' | 'list';

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

/** What the results show: the search, the filters and the order, all kept in the hash (SPEC §3.4). */
interface Browse {
  q: string;
  filters: Filters;
  sort: SortKey;
}

function libraryHash(browse: Browse, page?: number, panel?: PanelName): string {
  const query: Query = formatFilters(browse.filters);
  if (browse.q) query.q = browse.q;
  if (browse.sort !== DEFAULT_SORT) query.sort = browse.sort;
  if (page && page > 1) query.page = String(page);
  if (panel) query.panel = panel;
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
        {/* Always shown: IFDB cover art does not always carry the title. */}
        <span class="tile__title">{row.n}</span>
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
  details.push(formatName(row.f));
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

function SearchForm({ browse }: { browse: Browse }) {
  const q = browse.q;
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      class="search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const value = input.current ? input.current.value.trim() : '';
        location.hash = libraryHash({ ...browse, q: value });
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
        <a
          class="search__clear"
          href={libraryHash({ ...browse, q: '' })}
          aria-label={t('library.clear')}
        >
          ✕
        </a>
      )}
    </form>
  );
}

export function LibraryScreen({ query }: { query: Query }) {
  useLocale();
  const browse: Browse = {
    q: query.q || '',
    filters: parseFilters(query),
    sort: parseSort(query.sort),
  };
  const panel = parsePanel(query.panel);
  const [state, retry] = useCatalog();
  useReadyTiming('library', state.status !== 'loading');
  const [area, listRef] = useArea();
  const [view, setView] = useView();
  const grid = gridLayout(area.width, area.height);
  const perPage = view === 'grid' ? grid.perPage : listPerPage(area.height);
  const catalog = state.status === 'ready' ? state.catalog : null;
  // Search, then filter, then sort; recomputed only when one of them changes.
  const filterKey = formatQuery(formatFilters(browse.filters));
  const matches = useMemo(
    () =>
      catalog
        ? sortIndices(
            catalog.rows,
            applyFilters(
              catalog.rows,
              search(catalog.rows, catalog.keys, browse.q),
              browse.filters,
            ),
            browse.sort,
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, browse.q, filterKey, browse.sort],
  );
  const filtered = activeCount(browse.filters);

  if (catalog && panel) {
    return (
      <FiltersPanel
        panel={panel}
        catalog={catalog}
        filters={browse.filters}
        sort={browse.sort}
        count={matches.length}
        go={(change: PanelChange) =>
          location.replace(
            libraryHash(
              {
                q: browse.q,
                filters: change.filters || browse.filters,
                sort: change.sort || browse.sort,
              },
              1,
              change.panel,
            ),
          )
        }
      />
    );
  }

  const page = paginate(matches, parseInt(query.page || '1', 10), perPage);
  const clearFilters = libraryHash({ ...browse, filters: NO_FILTERS });

  let body;
  if (state.status === 'loading') {
    body = (
      <p class="library__status" role="status">
        {state.total
          ? t('library.loadingProgress', { loaded: state.loaded, total: state.total })
          : t('library.loading')}
      </p>
    );
  } else if (state.status === 'error' && !isOnline()) {
    // Offline (S5.3): the catalogue is not kept on the device.
    body = (
      <EmptyState title={t('offline.title')} text={t('offline.catalogue')}>
        <Button onClick={retry}>{t('library.retry')}</Button>
      </EmptyState>
    );
  } else if (state.status === 'error') {
    body = (
      <EmptyState title={t('library.loadFailed')} text={t('library.loadFailedText')}>
        <Button onClick={retry}>{t('library.retry')}</Button>
      </EmptyState>
    );
  } else if (!matches.length) {
    body = (
      <div class="library__status" role="status">
        <p>
          {browse.q ? t('library.noResults', { query: browse.q }) : t('library.noResultsFilters')}
        </p>
        {filtered > 0 && (
          <a class="library__link" href={clearFilters}>
            {t('library.clearFilters')}
          </a>
        )}
      </div>
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
      <SearchForm browse={browse} />
      <div class="library__bar">
        <p class="library__count">
          {catalog ? t('library.count', { count: matches.length }) : '\u00a0'}
        </p>
        {catalog && (
          <a class="library__action" href={libraryHash(browse, 1, 'filters')}>
            {filtered ? t('library.filtersCount', { count: filtered }) : t('library.filters')}
          </a>
        )}
        <button
          type="button"
          class="library__action"
          onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
        >
          {view === 'grid' ? t('library.viewList') : t('library.viewGrid')}
        </button>
      </div>
      <div class="library__list" ref={listRef}>
        {body}
      </div>
      {catalog && (
        <Pager
          page={page.page}
          pageCount={page.pageCount}
          hrefFor={(n) => libraryHash(browse, n)}
        />
      )}
    </div>
  );
}
