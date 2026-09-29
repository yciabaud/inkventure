import { GameScreen } from '../screens/game/GameScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { ReaderScreen } from '../screens/reader/ReaderScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
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
      return <ReaderScreen tuid={route.tuid} />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

export function App() {
  const location = useLocation();
  return (
    <div class="app">
      <TopBar current={location.route.name} />
      <main class="app__main">
        <Screen location={location} />
      </main>
    </div>
  );
}
