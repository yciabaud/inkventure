import type { ComponentChildren } from 'preact';
import { formatHash } from '../../app/router';
import { t } from '../../i18n/i18n';

export type Section = 'reading' | 'data' | 'about' | 'export' | 'import';

export function sectionHref(section?: Section): string {
  return formatHash({ name: 'settings' }, section ? { s: section } : {});
}

/** A section page: its title follows a "‹" back to the first page of Settings (or to `parent`). */
export function SectionPage({
  title,
  parent,
  children,
}: {
  title: string;
  parent?: { section: Section; label: string };
  children: ComponentChildren;
}) {
  return (
    <div class="screen settings-page ui-font">
      <h1 class="screen__title settings-page__title">
        <a
          class="settings-page__back"
          href={sectionHref(parent && parent.section)}
          aria-label={parent ? parent.label : t('settings.back')}
        >
          ‹
        </a>
        <span>{title}</span>
      </h1>
      {children}
    </div>
  );
}
