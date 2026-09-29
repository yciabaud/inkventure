import type { ComponentChildren } from 'preact';
import { formatHash, HOME } from '../app/router';
import { t } from '../i18n/i18n';
import { LinkButton } from './Button';

interface Props {
  message: string;
  title?: string;
  /** Extra actions (e.g. Retry); a link to Home is always offered. */
  children?: ComponentChildren;
}

export function ErrorPage({ message, title = t('error.title'), children }: Props) {
  return (
    <section class="error-page" role="alert">
      <h1 class="error-page__title">{title}</h1>
      <p class="error-page__text">{message}</p>
      <div class="error-page__actions">
        {children}
        <LinkButton variant="secondary" href={formatHash(HOME)}>
          {t('error.home')}
        </LinkButton>
      </div>
    </section>
  );
}
