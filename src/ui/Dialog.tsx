import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n/i18n';
import { IconButton } from './IconButton';
import { IconClose } from './icons';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/** Modal panel drawn with a thick border (no shadow or fade on e-ink). Escape or the backdrop closes it. */
export function Dialog({ title, onClose, children }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-running the focus effect on every render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the panel itself (not the close button) so screen readers enter the dialog without a focus ring.
    if (panel.current) panel.current.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Esc') closeRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, []);

  return (
    <div class="dialog-backdrop" onClick={onClose}>
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div class="dialog__header">
          <h2 class="dialog__title">{title}</h2>
          <IconButton icon={<IconClose />} label={t('dialog.close')} onClick={onClose} />
        </div>
        <div class="dialog__body">{children}</div>
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

/** A dialog listing full-width actions. */
export function Menu({
  title,
  items,
  onClose,
}: {
  title: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <ul class="menu">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              class="menu__item"
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
