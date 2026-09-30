import { t } from '../i18n/i18n';

interface Props {
  page: number;
  pageCount: number;
  /** Link for a page (1-based), so paging goes through the router and the back button. */
  hrefFor?: (page: number) => string;
  /** Or buttons, for paging that stays out of the history (a panel's options). */
  onPage?: (page: number) => void;
}

function Step({
  page,
  enabled,
  rel,
  hrefFor,
  onPage,
  children,
}: Props & { enabled: boolean; rel: string; children: string }) {
  if (!enabled) {
    return (
      <span class="pager__btn pager__btn--disabled" aria-disabled="true">
        {children}
      </span>
    );
  }
  if (onPage) {
    return (
      <button type="button" class="pager__btn" onClick={() => onPage(page)}>
        {children}
      </button>
    );
  }
  return (
    <a class="pager__btn" href={hrefFor ? hrefFor(page) : undefined} rel={rel}>
      {children}
    </a>
  );
}

/** "‹ Prev  2 / 14  Next ›" — explicit paging instead of scrolling. */
export function Pager({ page, pageCount, hrefFor, onPage }: Props) {
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(page, 1), pageCount);
  return (
    <nav class="pager" aria-label={t('pager.label')}>
      <Step
        page={current - 1}
        pageCount={pageCount}
        enabled={current > 1}
        rel="prev"
        hrefFor={hrefFor}
        onPage={onPage}
      >
        {'‹ ' + t('pager.prev')}
      </Step>
      <span
        class="pager__status"
        aria-label={t('pager.status', { page: current, count: pageCount })}
      >
        {current} / {pageCount}
      </span>
      <Step
        page={current + 1}
        pageCount={pageCount}
        enabled={current < pageCount}
        rel="next"
        hrefFor={hrefFor}
        onPage={onPage}
      >
        {t('pager.next') + ' ›'}
      </Step>
    </nav>
  );
}
