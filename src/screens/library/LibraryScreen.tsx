import { formatHash, type Query } from '../../app/router';
import { t } from '../../i18n/i18n';
import { LinkButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Pager } from '../../ui/Pager';

// Placeholder until the catalogue (S3.1): demonstrates paging through the hash query and links to a sample game.
export const SAMPLE_TUID = 'sample';
const SAMPLE_PAGES = 3;

export function LibraryScreen({ query }: { query: Query }) {
  const page = parseInt(query.page || '1', 10) || 1;
  return (
    <div class="screen">
      <h1 class="screen__title">{t('library.title')}</h1>
      <EmptyState title={t('library.emptyTitle')} text={t('library.emptyText')}>
        <LinkButton variant="secondary" href={formatHash({ name: 'game', tuid: SAMPLE_TUID })}>
          {t('library.sample')}
        </LinkButton>
      </EmptyState>
      <Pager
        page={page}
        pageCount={SAMPLE_PAGES}
        hrefFor={(n) => formatHash({ name: 'library' }, n > 1 ? { page: String(n) } : {})}
      />
    </div>
  );
}
