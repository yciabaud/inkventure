import { useState } from 'preact/hooks';
import { formatHash, type RouteName } from '../app/router';
import { t } from '../i18n/i18n';
import { Menu } from './Dialog';
import { IconButton } from './IconButton';
import { IconHome, IconLibrary, IconMore } from './icons';
import { refreshScreen } from './refreshScreen';

/**
 * Persistent header, Kindle-style: app name on the left, labelled icon buttons on the right; Settings and Refresh screen
 * are in the ⋯ menu.
 */
export function TopBar({ current }: { current: RouteName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const section =
    current === 'game' || current === 'play' ? 'library' : current === 'help' ? 'home' : current;

  return (
    <header class="top-bar">
      <a class="top-bar__brand" href={formatHash({ name: 'home' })}>
        {t('app.name')}
      </a>
      <nav class="top-bar__nav" aria-label={t('nav.main')}>
        <IconButton
          icon={<IconHome />}
          label={t('nav.home')}
          showLabel
          href={formatHash({ name: 'home' })}
          current={section === 'home'}
        />
        <IconButton
          icon={<IconLibrary />}
          label={t('nav.library')}
          showLabel
          href={formatHash({ name: 'library' })}
          current={section === 'library'}
        />
        <IconButton
          icon={<IconMore />}
          label={t('nav.menu')}
          showLabel
          expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        />
      </nav>
      {menuOpen && (
        <Menu
          title={t('menu.title')}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: t('nav.settings'),
              onSelect: () => {
                location.hash = formatHash({ name: 'settings' });
              },
            },
            { label: t('menu.refresh'), onSelect: () => refreshScreen() },
          ]}
        />
      )}
    </header>
  );
}
