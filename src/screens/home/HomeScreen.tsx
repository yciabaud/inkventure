// Home (SPEC §3.3; story S4.1): a welcome on the first launch, then the Featured shelf of the UI language, without the
// games already in progress. My adventures and the Continue hero arrive in S4.2.
import { useEffect, useMemo, useState } from 'preact/hooks';
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
import { paginate } from '../../catalog/search';
import { t, useLocale } from '../../i18n/i18n';
import { getStore, inProgressTuids } from '../../storage';
import { LinkButton } from '../../ui/Button';
import { Cover } from '../../ui/Cover';
import { Pager } from '../../ui/Pager';
import { useArea } from '../library/useArea';

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

function Card({ game, layout }: { game: FeaturedRow; layout: ShelfLayout }) {
  return (
    <li class="shelf__item">
      <a
        class="shelf-card"
        style={{ width: layout.cardWidth + 'px' }}
        href={formatHash({ name: 'game', tuid: game.t })}
        aria-label={game.a ? game.n + ', ' + game.a : game.n}
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

/**
 * Featured games, a page of cards at a time, turned with ‹ › (no history entry per page). The shelf takes the height
 * left on the screen and sizes its covers to it; the pager has a slot of its own, so showing it never changes the
 * room measured for the cards.
 */
function FeaturedShelf({ games }: { games: FeaturedRow[] }) {
  const [area, areaRef] = useArea();
  const [page, setPage] = useState(1);
  const layout = shelfLayout(area.width, area.height);
  const shown = paginate(games, page, layout.perPage);
  return (
    <section class="shelf" aria-labelledby="featured-title">
      <h2 class="shelf__title" id="featured-title">
        {t('home.featured')}
      </h2>
      <div class="shelf__row" ref={areaRef}>
        <ul class="shelf__cards" aria-label={t('home.featured')}>
          {shown.items.map((game) => (
            <Card key={game.t} game={game} layout={layout} />
          ))}
        </ul>
      </div>
      <div class="shelf__pager">
        <Pager page={shown.page} pageCount={shown.pageCount} onPage={setPage} />
      </div>
    </section>
  );
}

export function HomeScreen() {
  const locale = useLocale();
  const featured = useFeatured();
  const store = getStore();
  const inProgress = useMemo(() => inProgressTuids(store), [store]);
  const firstLaunch = Object.keys(inProgress).length === 0;
  const games =
    featured.status === 'ready'
      ? featuredFor(featured.file, locale, (tuid) => !!inProgress[tuid])
      : [];

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
      {games.length > 0 && <FeaturedShelf key={locale} games={games} />}
      {featured.status === 'loading' && (
        <p class="library__status" role="status">
          {t('home.loading')}
        </p>
      )}
      {/* Without a shelf (no list for this language, or it could not be loaded), point to the Library. */}
      {featured.status !== 'loading' && !games.length && (
        <p class="home__browse">
          <LinkButton href={formatHash({ name: 'library' })}>{t('home.browse')}</LinkButton>
        </p>
      )}
    </div>
  );
}
