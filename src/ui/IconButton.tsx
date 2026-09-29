import type { ComponentChildren } from 'preact';

interface Props {
  icon: ComponentChildren;
  label: string;
  /** Show the label under the icon (top bar); otherwise it is only announced to screen readers. */
  showLabel?: boolean;
  href?: string;
  current?: boolean;
  onClick?: () => void;
  expanded?: boolean;
}

/** Square tap target (≥ 48 × 48 px) with an icon. Renders a link when `href` is given. */
export function IconButton({ icon, label, showLabel, href, current, onClick, expanded }: Props) {
  const cls = 'icon-btn' + (current ? ' icon-btn--current' : '');
  const content = [
    icon,
    <span key="label" class={showLabel ? 'icon-btn__label' : 'visually-hidden'}>
      {label}
    </span>,
  ];
  if (href) {
    return (
      <a class={cls} href={href} aria-current={current ? 'page' : undefined}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" class={cls} onClick={onClick} aria-expanded={expanded}>
      {content}
    </button>
  );
}
