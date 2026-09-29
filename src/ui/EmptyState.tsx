import type { ComponentChildren } from 'preact';

interface Props {
  title: string;
  text?: string;
  children?: ComponentChildren;
}

/** Centered message for screens without content yet, with optional actions. */
export function EmptyState({ title, text, children }: Props) {
  return (
    <section class="empty-state">
      <p class="empty-state__ornament" aria-hidden="true">
        ❦
      </p>
      <h2 class="empty-state__title">{title}</h2>
      {text && <p class="empty-state__text">{text}</p>}
      {children && <div class="empty-state__actions">{children}</div>}
    </section>
  );
}
