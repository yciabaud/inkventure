// Home (SPEC §3.3; stories S4.1, S4.2): a welcome on the first launch; else the Continue hero (the last game played)
// and My adventures; then the Featured shelf of the UI language, without the games already in progress. Shelves share
// the height left on the screen and are paged with ‹ › in their header, never scrolled.
import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { formatHash } from '../../app/router';
import {
  featuredFor,
  loadFeatured,
  shelfLayout,
  type FeaturedFile,
  type FeaturedRow,
  type ShelfLayout,
} from '../../catalog/featured';
import { thumbnailUrl } from '../../catalog/game';
import { gridLayout, type GridLayout } from '../../catalog/layout';
import { paginate } from '../../catalog/search';
import { formatRelativeDate, t, useLocale } from '../../i18n/i18n';
import {
  continueGame,
  getStore,
  inProgressTuids,
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

/** Continue hero cover (2:3). */
const HERO_COVER_WIDTH = 60;

/** The game's cover in its menu. */
const MENU_COVER_WIDTH = 64;

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
  children,
}: {
  label: string;
  heading: ComponentChildren;
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
      <div class="shelf__row" ref={rowRef}>
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

function FeaturedCard({ game, layout }: { game: FeaturedRow; layout: ShelfLayout }) {
  return (
    <li class="shelf__item">
      <a
        class="shelf-card"
        style={{ width: layout.cardWidth + 'px' }}
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
        {game.st && <span class="badge shelf-card__badge">{t('filters.start')}</span>}
        <span class="shelf-card__title">{game.n}</span>
        <span class="shelf-card__text">{game.pi || game.a}</span>
      </a>
    </li>
  );
}

/** Featured games, with their pitch. */
function FeaturedShelf({ games, heading }: { games: FeaturedRow[]; heading: ComponentChildren }) {
  const [area, areaRef] = useArea();
  const [page, setPage] = useState(1);
  const layout = shelfLayout(area.width, area.height);
  const shown = paginate(games, page, layout.perPage);
  return (
    <Shelf
      label={t('home.featured')}
      heading={heading}
      page={shown.page}
      pageCount={shown.pageCount}
      onPage={setPage}
      rowRef={areaRef}
    >
      <ul class="shelf__cards" aria-label={t('home.featured')}>
        {shown.items.map((game) => (
          <FeaturedCard key={game.t} game={game} layout={layout} />
        ))}
      </ul>
    </Shelf>
  );
}

function ContinueHero({ game }: { game: Adventure }) {
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
      <LinkButton href={formatHash({ name: 'play', tuid: game.tuid })}>
        {t('game.continue')}
      </LinkButton>
    </section>
  );
}

/**
 * The menu of a game of My adventures (its "⋮"): the game (cover, title, author, progress), then Continue, its page,
 * or Remove from Home (then `RemoveDialog`).
 */
function GameMenu({
  game,
  onClose,
  onRemove,
}: {
  game: Adventure;
  onClose: () => void;
  onRemove: (game: Adventure) => void;
}) {
  const go = (hash: string) => {
    onClose();
    window.location.hash = hash;
  };
  const items = [
    {
      label: game.lastPlayed ? t('game.continue') : t('game.play'),
      onSelect: () => go(formatHash({ name: 'play', tuid: game.tuid })),
    },
    { label: t('game.details'), onSelect: () => go(formatHash({ name: 'game', tuid: game.tuid })) },
    {
      label: t('game.removeFromHome'),
      onSelect: () => {
        onClose();
        onRemove(game);
      },
    },
  ];
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
          </div>
        </div>
        <ul class="menu">
          {items.map((item) => (
            <li key={item.label}>
              <button type="button" class="menu__item" onClick={item.onSelect}>
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
  onMore,
}: {
  game: Adventure;
  layout: GridLayout;
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
  onChange,
}: {
  games: Adventure[];
  heading: ComponentChildren;
  onChange: () => void;
}) {
  const [page, setPage] = useState(1);
  const [menuFor, setMenuFor] = useState<Adventure | null>(null);
  const [removing, setRemoving] = useState<Adventure | null>(null);
  const [area, areaRef] = useArea();
  const layout = gridLayout(area.width, area.height);
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
      >
        <ul
          class="tiles"
          aria-label={t('home.adventures')}
          style={{
            gridTemplateColumns: 'repeat(' + layout.columns + ', ' + layout.coverWidth + 'px)',
          }}
        >
          {shown.items.map((game) => (
            <AdventureCard key={game.tuid} game={game} layout={layout} onMore={setMenuFor} />
          ))}
        </ul>
      </Shelf>
      {menuFor && (
        <GameMenu game={menuFor} onClose={() => setMenuFor(null)} onRemove={setRemoving} />
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
          </p>
        </section>
      )}
      {hero && <ContinueHero game={hero} />}
      {shelf === 'adventures' && (
        <AdventuresShelf
          key={version}
          games={adventures}
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
      {/* Without a shelf (no list for this language, or it could not be loaded), point to the Library. */}
      {featured.status !== 'loading' && !games.length && !adventures.length && (
        <p class="home__browse">
          <LinkButton href={formatHash({ name: 'library' })}>{t('home.browse')}</LinkButton>
        </p>
      )}
    </div>
  );
}
