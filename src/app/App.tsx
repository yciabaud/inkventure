import { GameScreen } from '../screens/game/GameScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { isImmersive, ReaderScreen } from '../screens/reader/ReaderScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { useLocale } from '../i18n/i18n';
import { getStore } from '../storage';
import { StorageNotice } from '../ui/StorageNotice';
import { TopBar } from '../ui/TopBar';
import { useLocation, type Location } from './router';

function Screen({ location }: { location: Location }) {
  const { route, query } = location;
  switch (route.name) {
    case 'library':
      return <LibraryScreen query={query} />;
    case 'game':
      return <GameScreen tuid={route.tuid} />;
    case 'play':
      return <ReaderScreen tuid={route.tuid} language={query.lang} />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

export function App() {
  const location = useLocation();
  // Re-render the whole tree when the UI language changes (t() reads the current locale).
  const locale = useLocale();
  const route = location.route;
  if (route.name === 'play' && isImmersive(route.tuid)) {
    // The reader takes the whole screen and shows the top bar itself when its top zone is tapped.
    return (
      <div class="app" lang={locale}>
        <ReaderScreen tuid={route.tuid} language={location.query.lang} />
      </div>
    );
  }
  return (
    <div class="app" lang={locale}>
      <TopBar current={location.route.name} />
      <main class="app__main">
        <StorageNotice store={getStore()} />
        <Screen location={location} />
      </main>
    </div>
  );
}
