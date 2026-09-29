import { t } from '../i18n/i18n';

interface Props {
  page: number;
  pageCount: number;
  /** Link for a page (1-based), so paging goes through the router and the back button. */
  hrefFor: (page: number) => string;
}

/** "‹ Prev  2 / 14  Next ›" — explicit paging instead of scrolling. */
export function Pager({ page, pageCount, hrefFor }: Props) {
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(page, 1), pageCount);
  return (
    <nav class="pager" aria-label={t('pager.label')}>
      {current > 1 ? (
        <a class="pager__btn" href={hrefFor(current - 1)} rel="prev">
          ‹ {t('pager.prev')}
        </a>
      ) : (
        <span class="pager__btn pager__btn--disabled" aria-disabled="true">
          ‹ {t('pager.prev')}
        </span>
      )}
      <span
        class="pager__status"
        aria-label={t('pager.status', { page: current, count: pageCount })}
      >
        {current} / {pageCount}
      </span>
      {current < pageCount ? (
        <a class="pager__btn" href={hrefFor(current + 1)} rel="next">
          {t('pager.next')} ›
        </a>
      ) : (
        <span class="pager__btn pager__btn--disabled" aria-disabled="true">
          {t('pager.next')} ›
        </span>
      )}
    </nav>
  );
}
