import { useState } from 'preact/hooks';
import { formatHash, type RouteName } from '../app/router';
import { t } from '../i18n/i18n';
import { Menu } from './Dialog';
import { IconButton } from './IconButton';
import { IconHome, IconLibrary, IconMore, IconSettings } from './icons';
import { refreshScreen } from './refreshScreen';

/** Persistent header, Kindle-style: app name on the left, labelled icon buttons on the right. */
export function TopBar({ current }: { current: RouteName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const section = current === 'game' || current === 'play' ? 'library' : current;

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
          icon={<IconSettings />}
          label={t('nav.settings')}
          showLabel
          href={formatHash({ name: 'settings' })}
          current={section === 'settings'}
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
          items={[{ label: t('menu.refresh'), onSelect: () => refreshScreen() }]}
        />
      )}
    </header>
  );
}
