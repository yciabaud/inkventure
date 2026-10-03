// Home (SPEC §3.3; stories S4.1, S4.2): a welcome on the first launch; else the Continue hero (the last game played)
// and My adventures; then the Featured shelf of the UI language, without the games already in progress. Shelves share
// the height left on the screen and are paged with ‹ › in their header, never scrolled. Offline (S5.3), Home runs on
// local data: adventures that are not kept show "Needs Wi-Fi", and Featured says the catalogue needs a connection.
import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useOnline } from '../../app/offline';
import { useReadyTiming } from '../../app/perf';
import { formatHash, navigate, type Route } from '../../app/router';
import {
  featuredFor,
  loadFeatured,
  type FeaturedFile,
  type FeaturedRow,
} from '../../catalog/featured';
import { thumbnailUrl } from '../../catalog/game';
import { gridLayout, type GridLayout } from '../../catalog/layout';
import { paginate } from '../../catalog/search';
import { formatRelativeDate, t, useLocale } from '../../i18n/i18n';
import {
  continueGame,
  getStore,
  inProgressTuids,
  getKept,
  isKept,
  isStorageFullError,
  myAdventures,
  removeFromHome,
  sortRecent,
  type Adventure,
} from '../../storage';
import { Button, LinkButton } from '../../ui/Button';
import { Cover } from '../../ui/Cover';
import { Dialog } from '../../ui/Dialog';
import { Pager } from '../../ui/Pager';
import { useArea } from '../library/useArea';
import { formatSize } from '../settings/SettingsScreen';

/** Continue hero cover (2:3). */
const HERO_COVER_WIDTH = 60;

/** The game's cover in its menu. */
const MENU_COVER_WIDTH = 64;

/** Side margin of the page (`.app__main` padding). */
const PAGE_GUTTER = 16;

/** The "⋮" button over a cover (its tap target). */
const MORE_SIZE = 48;

type FeaturedState =
  { status: 'loading' } | { status: 'ready'; file: FeaturedFile } | { status: 'error' };

function useFeatured(): FeaturedState {
  const [state, setState] = useState<FeaturedState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    loadFeatured().then(
      (file) => live && setState({ status: 'ready', file: file }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

function label(title: string, author: string): string {
  return author ? title + ', ' + author : title;
}

/** "Turn 142 · last played 2 days ago" (or only the turn, or only the date). */
function progressText(game: Adventure): string {
  const parts: string[] = [];
  if (game.turns) parts.push(t('home.turn', { turn: game.turns }));
  if (game.lastPlayed) {
    parts.push(t('home.lastPlayed', { date: formatRelativeDate(new Date(game.lastPlayed)) }));
  }
  return parts.join(' · ');
}

/** A shelf: its heading (title or tabs) and ‹ › in one header row, then a row of items sized to the height left. */
function Shelf({
  label,
  heading,
  page,
  pageCount,
  onPage,
  rowRef,
  bleed,
  children,
}: {
  label: string;
  heading: ComponentChildren;
  /** The row spans the screen's side margins too (a grid spaces its covers evenly up to the screen edges). */
  bleed?: boolean;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  rowRef: RefObject<HTMLDivElement>;
  children: ComponentChildren;
}) {
  return (
    <section class="shelf" aria-label={label}>
      <div class="shelf__head">
        {heading}
        <Pager page={page} pageCount={pageCount} onPage={onPage} compact />
      </div>
      <div class={bleed ? 'shelf__row shelf__row--bleed' : 'shelf__row'} ref={rowRef}>
        {children}
      </div>
    </section>
  );
}

type ShelfName = 'adventures' | 'featured';

/** A shelf's title, when it is alone on Home. */
function ShelfTitle({ title }: { title: string }) {
  return <h2 class="shelf__title">{title}</h2>;
}

/**
 * My adventures | Featured, when the player has both: one shelf at a time, so its covers can be large. The tab is
 * in the hash (`?shelf=featured`), replaced rather than pushed, so Back leaves Home as usual.
 */
function ShelfTabs({ current }: { current: ShelfName }) {
  const tab = (name: ShelfName, title: string) => {
    const href = formatHash({ name: 'home' }, name === 'featured' ? { shelf: 'featured' } : {});
    return (
      <a
        class={'tabs__tab' + (current === name ? ' tabs__tab--on' : '')}
        href={href}
        aria-current={current === name ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault();
          window.location.replace(href);
        }}
      >
        {title}
      </a>
    );
  };
  return (
    <nav class="tabs" aria-label={t('home.shelves')}>
      {tab('adventures', t('home.adventures'))}
      {tab('featured', t('home.featured'))}
    </nav>
  );
}

/** The shelves' grid: the Library's, sized for the page's content width, spaced evenly up to the screen edges. */
function useShelfGrid(): [GridLayout, RefObject<HTMLDivElement>] {
  const [area, areaRef] = useArea();
  return [gridLayout(Math.max(area.width - 2 * PAGE_GUTTER, 0), area.height), areaRef];
}

function Tiles({
  label,
  layout,
  children,
}: {
  label: string;
  layout: GridLayout;
  children: ComponentChildren;
}) {
  return (
    <ul
      class="tiles tiles--even"
      aria-label={label}
      style={{ gridTemplateColumns: 'repeat(' + layout.columns + ', ' + layout.coverWidth + 'px)' }}
    >
      {children}
    </ul>
  );
}

/** A featured game: its cover (with "Start here" on newcomer-friendly games) and title, like My adventures. */
function FeaturedTile({ game, layout }: { game: FeaturedRow; layout: GridLayout }) {
  return (
    <li class="tiles__item">
      <a
        class="tile"
        href={formatHash({ name: 'game', tuid: game.t })}
        aria-label={label(game.n, game.a)}
      >
        <Cover
          title={game.n}
          author={game.a}
          width={layout.coverWidth}
          imageUrl={
            game.c ? thumbnailUrl(game.t, layout.coverWidth, layout.coverHeight) : undefined
          }
        />
        <span class="tile__title">{game.n}</span>
        {game.st && <span class="badge tile__badge">{t('filters.start')}</span>}
      </a>
    </li>
  );
}

/** Featured games, in the same grid as My adventures. */
function FeaturedShelf({ games, heading }: { games: FeaturedRow[]; heading: ComponentChildren }) {
  const [layout, areaRef] = useShelfGrid();
  const [page, setPage] = useState(1);
  const shown = paginate(games, page, layout.perPage);
  return (
    <Shelf
      label={t('home.featured')}
      heading={heading}
      page={shown.page}
      pageCount={shown.pageCount}
      onPage={setPage}
      rowRef={areaRef}
      bleed
    >
      <Tiles label={t('home.featured')} layout={layout}>
        {shown.items.map((game) => (
          <FeaturedTile key={game.t} game={game} layout={layout} />
        ))}
      </Tiles>
    </Shelf>
  );
}

/** "Needs Wi-Fi" in place of an action that would download the game (S5.3). */
function NeedsWifi() {
  return (
    <span class="btn btn--primary btn--off" aria-disabled="true">
      {t('offline.needsWifi')}
    </span>
  );
}

function ContinueHero({ game, needsWifi }: { game: Adventure; needsWifi: boolean }) {
  return (
    <section class="hero" aria-label={t('home.continueTitle')}>
      <Cover
        title={game.title}
        author={game.author}
        width={HERO_COVER_WIDTH}
        imageUrl={
          game.cover ? thumbnailUrl(game.tuid, HERO_COVER_WIDTH, HERO_COVER_WIDTH * 1.5) : undefined
        }
      />
      <div class="hero__text">
        <p class="hero__title">{game.title}</p>
        <p class="hero__meta">{progressText(game)}</p>
      </div>
      {needsWifi ? (
        <NeedsWifi />
      ) : (
        <LinkButton href={formatHash({ name: 'play', tuid: game.tuid })}>
          {t('game.continue')}
        </LinkButton>
      )}
    </section>
  );
}

type MenuKeeping = 'idle' | 'keeping' | 'failed';

/**
 * The menu of a game of My adventures (its "⋮"): the game (cover, title, author, progress), then Continue, its page,
 * Keep offline or Remove from device, or Remove from Home (then `RemoveDialog`). Offline, a game that is not kept
 * needs Wi-Fi to be played.
 */
function GameMenu({
  game,
  online,
  onClose,
  onRemove,
  onChange,
}: {
  game: Adventure;
  online: boolean;
  onClose: () => void;
  onRemove: (game: Adventure) => void;
  onChange: () => void;
}) {
  const store = getStore();
  const kept = isKept(store, game.tuid);
  const [keeping, setKeeping] = useState<MenuKeeping>('idle');
  const go = (route: Route) => {
    onClose();
    navigate(route);
  };
  const items: Array<{ label: string; onSelect?: () => void }> = [
    {
      label:
        !online && !kept
          ? t('offline.needsWifi')
          : game.lastPlayed
            ? t('game.continue')
            : t('game.play'),
      onSelect: !online && !kept ? undefined : () => go({ name: 'play', tuid: game.tuid }),
    },
    { label: t('game.details'), onSelect: () => go({ name: 'game', tuid: game.tuid }) },
  ];
  if (kept) {
    items.push({
      label: t('offline.remove'),
      onSelect: () => {
        import('../../catalog/offline')
          .then((offline) => offline.removeKept(store, game.tuid))
          .then(onChange, onChange);
      },
    });
  } else if (online) {
    items.push({
      label: t('offline.keep'),
      onSelect:
        keeping === 'keeping'
          ? undefined
          : () => {
              setKeeping('keeping');
              import('../../catalog/offline')
                .then((offline) => offline.keepAdventure(store, game.tuid))
                .then(
                  () => {
                    setKeeping('idle');
                    onChange();
                  },
                  () => setKeeping('failed'),
                );
            },
    });
  }
  items.push({
    label: t('game.removeFromHome'),
    onSelect: () => {
      onClose();
      onRemove(game);
    },
  });
  const entry = kept ? getKept(store)[game.tuid] : undefined;
  let status = '';
  if (keeping === 'keeping') status = t('offline.keeping');
  else if (keeping === 'failed') status = t('offline.keepFailed');
  else if (entry) status = t('offline.kept', { size: formatSize(entry.size) });
  return (
    <Dialog title={t('home.menuTitle')} onClose={onClose}>
      <div class="game-menu">
        <div class="game-menu__game">
          <Cover
            title={game.title}
            author={game.author}
            width={MENU_COVER_WIDTH}
            imageUrl={
              game.cover
                ? thumbnailUrl(game.tuid, MENU_COVER_WIDTH, MENU_COVER_WIDTH * 1.5)
                : undefined
            }
          />
          <div class="game-menu__text">
            <p class="game-menu__title">{game.title}</p>
            {game.author && <p class="game-menu__meta">{game.author}</p>}
            {progressText(game) && <p class="game-menu__meta">{progressText(game)}</p>}
            {status && (
              <p class="game-menu__meta" role={keeping === 'failed' ? 'alert' : 'status'}>
                {status}
              </p>
            )}
          </div>
        </div>
        <ul class="menu">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                class="menu__item"
                disabled={!item.onSelect}
                onClick={item.onSelect}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

/** Confirms Remove from Home, with the choice to delete the game's saves too (off by default). */
function RemoveDialog({
  game,
  onClose,
  onRemoved,
}: {
  game: Adventure;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [deleteSaves, setDeleteSaves] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog title={t('home.removeTitle', { title: game.title })} onClose={onClose}>
      <div class="saves ui-font">
        <p class="saves__hint">{t('home.removeText')}</p>
        <label class="check">
          <input
            type="checkbox"
            checked={deleteSaves}
            onChange={(event) => setDeleteSaves((event.target as HTMLInputElement).checked)}
          />
          <span>{t('home.deleteSaves')}</span>
        </label>
        {failed && (
          <p class="saves__message saves__message--error" role="alert">
            {t('home.removeFailed')}
          </p>
        )}
        <div class="saves__buttons">
          <Button variant="secondary" onClick={onClose}>
            {t('saves.cancel')}
          </Button>
          <Button
            onClick={() => {
              try {
                removeFromHome(getStore(), game.tuid, { deleteSaves: deleteSaves });
                onRemoved();
              } catch (error) {
                if (!isStorageFullError(error)) throw error;
                setFailed(true);
              }
            }}
          >
            {t('home.remove')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** A cover of My adventures, with its "⋮" over the bottom right corner (like the Kindle library). */
function AdventureCard({
  game,
  layout,
  needsWifi,
  onMore,
}: {
  game: Adventure;
  layout: GridLayout;
  /** Offline, and not kept on the device (S5.3). */
  needsWifi: boolean;
  onMore: (game: Adventure) => void;
}) {
  return (
    <li class="tiles__item">
      <a
        class="tile"
        href={formatHash({ name: 'game', tuid: game.tuid })}
        aria-label={label(game.title, game.author)}
      >
        <Cover
          title={game.title}
          author={game.author}
          width={layout.coverWidth}
          imageUrl={
            game.cover ? thumbnailUrl(game.tuid, layout.coverWidth, layout.coverHeight) : undefined
          }
        />
        <span class="tile__title">{game.title}</span>
        {needsWifi && <span class="badge tile__badge">{t('offline.needsWifi')}</span>}
      </a>
      <button
        type="button"
        class="more-btn"
        style={{
          top: layout.coverHeight - MORE_SIZE + 'px',
          left: layout.coverWidth - MORE_SIZE + 'px',
        }}
        aria-label={t('home.moreFor', { title: game.title })}
        onClick={() => onMore(game)}
      >
        <span class="more-btn__dots" aria-hidden="true">
          ⋮
        </span>
      </button>
    </li>
  );
}

/** My adventures: a grid of covers like the Library's (as many rows as fit), last played first, a page at a time. */
function AdventuresShelf({
  games,
  heading,
  online,
  onChange,
}: {
  games: Adventure[];
  heading: ComponentChildren;
  online: boolean;
  onChange: () => void;
}) {
  const store = getStore();
  // Redrawn when a game is kept or removed from the device, with its menu still open.
  const [, setKeptVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [menuFor, setMenuFor] = useState<Adventure | null>(null);
  const [removing, setRemoving] = useState<Adventure | null>(null);
  const [layout, areaRef] = useShelfGrid();
  const shown = paginate(sortRecent(games), page, layout.perPage);
  return (
    <>
      <Shelf
        label={t('home.adventures')}
        heading={heading}
        page={shown.page}
        pageCount={shown.pageCount}
        onPage={setPage}
        rowRef={areaRef}
        bleed
      >
        <Tiles label={t('home.adventures')} layout={layout}>
          {shown.items.map((game) => (
            <AdventureCard
              key={game.tuid}
              game={game}
              layout={layout}
              needsWifi={!online && !isKept(store, game.tuid)}
              onMore={setMenuFor}
            />
          ))}
        </Tiles>
      </Shelf>
      {menuFor && (
        <GameMenu
          game={menuFor}
          online={online}
          onClose={() => setMenuFor(null)}
          onRemove={setRemoving}
          onChange={() => setKeptVersion((n) => n + 1)}
        />
      )}
      {removing && (
        <RemoveDialog
          game={removing}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            setRemoving(null);
            onChange();
          }}
        />
      )}
    </>
  );
}

export function HomeScreen({ query = {} }: { query?: Record<string, string> }) {
  const locale = useLocale();
  const featured = useFeatured();
  const online = useOnline();
  useReadyTiming('home', featured.status !== 'loading');
  const store = getStore();
  // Read again after a removal.
  const [version, setVersion] = useState(0);
  const adventures = myAdventures(store);
  const hero = continueGame(adventures);
  const inProgress = inProgressTuids(store);
  const firstLaunch = Object.keys(inProgress).length === 0;
  const games =
    featured.status === 'ready'
      ? featuredFor(featured.file, locale, (tuid) => !!inProgress[tuid])
      : [];
  // One shelf at a time: My adventures, unless the Featured tab is chosen or there are no adventures.
  const both = adventures.length > 0 && games.length > 0;
  let shelf: ShelfName | null = null;
  if (adventures.length && (query.shelf !== 'featured' || !games.length)) shelf = 'adventures';
  else if (games.length) shelf = 'featured';

  return (
    <div class="screen home">
      <h1 class="screen__title">{t('home.title')}</h1>
      {firstLaunch && (
        <section class="welcome">
          <h2 class="welcome__title">{t('home.emptyTitle')}</h2>
          <p class="welcome__text">{t('home.welcomeText')}</p>
          <p class="welcome__links">
            <a class="welcome__link" href={formatHash({ name: 'help' })}>
              {t('home.howToPlay')}
            </a>
            {/* The ebook download page (S6.3), next to the app. */}
            <a class="welcome__link" href="ebook/">
              {t('home.ebook')}
            </a>
          </p>
        </section>
      )}
      {hero && <ContinueHero game={hero} needsWifi={!online && !isKept(store, hero.tuid)} />}
      {shelf === 'adventures' && (
        <AdventuresShelf
          key={version}
          games={adventures}
          online={online}
          heading={
            both ? <ShelfTabs current={shelf} /> : <ShelfTitle title={t('home.adventures')} />
          }
          onChange={() => setVersion((n) => n + 1)}
        />
      )}
      {shelf === 'featured' && (
        <FeaturedShelf
          key={locale}
          games={games}
          heading={both ? <ShelfTabs current={shelf} /> : <ShelfTitle title={t('home.featured')} />}
        />
      )}
      {featured.status === 'loading' && (
        <p class="library__status" role="status">
          {t('home.loading')}
        </p>
      )}
      {/* Offline, the featured lists cannot be loaded: say why rather than offer the Library (S5.3). */}
      {featured.status === 'error' && !online && (
        <p class="home__offline" role="status">
          {t('offline.catalogue')}
        </p>
      )}
      {/* Without a shelf (no list for this language, or it could not be loaded), point to the Library. */}
      {featured.status !== 'loading' && !games.length && !adventures.length && online && (
        <p class="home__browse">
          <LinkButton href={formatHash({ name: 'library' })}>{t('home.browse')}</LinkButton>
        </p>
      )}
    </div>
  );
}
