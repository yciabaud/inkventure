import { formatHash } from '../../app/router';
import { t } from '../../i18n/i18n';
import { LinkButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';

// Placeholder: the paginated reader arrives in S1.1 (the top bar will then hide until the top zone is tapped).
export function ReaderScreen({ tuid }: { tuid: string }) {
  return (
    <div class="screen">
      <h1 class="screen__title">{t('play.title')}</h1>
      <EmptyState title={t('play.emptyTitle')} text={t('play.emptyText', { tuid })}>
        <LinkButton variant="secondary" href={formatHash({ name: 'game', tuid })}>
          {t('play.back')}
        </LinkButton>
      </EmptyState>
    </div>
  );
}
