import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n/i18n';
import { blockClass } from './measure';
import { PageTurner, type PageView } from './pageTurner';
import { pageFragments, type ReaderBlock } from './paginator';

interface Props {
  blocks: ReaderBlock[];
  /** Shown under the text on the last page only (command bar, choices). */
  lastPageSlot: ComponentChildren;
  /** Called before a tap or swipe turns the page; returning true consumes it (e.g. to close a menu). */
  interceptTap?: () => boolean;
}

/**
 * Game text laid out in pages that exactly fit the text area (no scrolling), turned by tap zones, swipes or the
 * arrow keys. The reading position survives re-pagination (resize, rotation, font changes).
 */
export function PagedText({ blocks, lastPageSlot, interceptTap }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<PageView>({ pages: [], index: 0 });
  const [turner] = useState(() => new PageTurner(setView));

  useLayoutEffect(() => {
    turner.setInterceptTap(interceptTap);
  });

  // Declared before the blocks effect so the first layout finds the elements; both run before the browser paints.
  useLayoutEffect(() => {
    if (areaRef.current && textRef.current) return turner.attach(areaRef.current, textRef.current);
  }, [turner]);

  useLayoutEffect(() => {
    turner.setBlocks(blocks);
  }, [turner, blocks]);

  const count = Math.max(view.pages.length, 1);
  const current = Math.min(view.index, count - 1);
  const isLast = current === count - 1;
  const fragments = view.pages.length ? pageFragments(blocks, view.pages[current]) : [];

  return (
    <div class="reader__body">
      <div class="reader__page" ref={areaRef} role="region" aria-label={t('reader.text')}>
        <div class="reader__text" ref={textRef}>
          {fragments.map((fragment) => (
            <p
              key={fragment.block + ':' + fragment.start}
              class={blockClass(fragment.kind)}
              data-block={fragment.block}
              data-start={fragment.start}
              data-end={fragment.end}
            >
              {fragment.text}
            </p>
          ))}
        </div>
      </div>
      <div class="reader__slot">
        {isLast ? (
          lastPageSlot
        ) : (
          <button type="button" class="reader__present" onClick={() => turner.last()}>
            {t('reader.backToPresent')} ›
          </button>
        )}
      </div>
      <div
        class="reader__indicator ui-font"
        aria-label={t('pager.status', { page: current + 1, count: count })}
      >
        {current + 1} / {count}
      </div>
    </div>
  );
}
