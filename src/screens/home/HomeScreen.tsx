import { formatHash } from '../../app/router';
import { t } from '../../i18n/i18n';
import { LinkButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { FIXTURE_Z_TUID } from '../reader/ReaderScreen';

// Placeholder: Featured, My adventures and Continue arrive in S4.1 / S4.2.
export function HomeScreen() {
  return (
    <div class="screen">
      <h1 class="screen__title">{t('home.title')}</h1>
      <EmptyState title={t('home.emptyTitle')} text={t('home.emptyText')}>
        <LinkButton href={formatHash({ name: 'library' })}>{t('home.browse')}</LinkButton>
        <LinkButton variant="secondary" href={formatHash({ name: 'play', tuid: FIXTURE_Z_TUID })}>
          {t('home.playFixture')}
        </LinkButton>
      </EmptyState>
    </div>
  );
}
