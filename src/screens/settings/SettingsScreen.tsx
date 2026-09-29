import { t } from '../../i18n/i18n';
import { EmptyState } from '../../ui/EmptyState';

// Placeholder: language, reader defaults and data management arrive in S5.1 / S5.2.
export function SettingsScreen() {
  return (
    <div class="screen">
      <h1 class="screen__title">{t('settings.title')}</h1>
      <EmptyState title={t('settings.emptyTitle')} text={t('settings.emptyText')} />
    </div>
  );
}
