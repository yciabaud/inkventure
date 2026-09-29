import type { ComponentChildren } from 'preact';

type Variant = 'primary' | 'secondary';

interface CommonProps {
  children: ComponentChildren;
  variant?: Variant;
  block?: boolean;
}

function className(variant: Variant, block?: boolean): string {
  return 'btn btn--' + variant + (block ? ' btn--block' : '');
}

/** Action button (≥ 48 px). */
export function Button({
  children,
  variant = 'primary',
  block,
  onClick,
  type = 'button',
}: CommonProps & { onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button type={type} class={className(variant, block)} onClick={onClick}>
      {children}
    </button>
  );
}

/** Navigation styled as a button: a plain link, so it works with the hash router and the back button. */
export function LinkButton({
  children,
  variant = 'primary',
  block,
  href,
}: CommonProps & { href: string }) {
  return (
    <a class={className(variant, block)} href={href}>
      {children}
    </a>
  );
}
