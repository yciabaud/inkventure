import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n/i18n';
import { blockClass, runClass } from './measure';
import { PageTurner, type PageView, type TapInterceptor } from './pageTurner';
import { pageFragments, type ReaderBlock } from './paginator';

interface Props {
  blocks: ReaderBlock[];
  /** Shown under the text on the last page only (command bar, choices). */
  lastPageSlot: ComponentChildren;
  /** Called before a tap or swipe turns the page; returning true consumes it (e.g. to close a menu). */
  interceptTap?: TapInterceptor;
  /** Stay on the last page across re-layouts (the command field has focus). */
  pinToLast?: boolean;
  /** Extra class for the slot under the text (its height is the same on every page). */
  slotClass?: string;
  /** Inline style of the text area (reader settings: font, size, spacing, margins, alignment). */
  textStyle?: Record<string, string>;
  /** Changes whenever `textStyle` changes the layout: the text is paginated again, keeping the reading position. */
  layoutKey?: string;
  /** When the blocks change, open on the page where this block starts (the echoed command of a new turn). */
  focus?: number;
}

/**
 * Game text laid out in pages that exactly fit the text area (no scrolling), turned by tap zones, swipes or the
 * arrow keys. The reading position survives re-pagination (resize, rotation, font changes).
 */
export function PagedText({
  blocks,
  lastPageSlot,
  interceptTap,
  focus,
  pinToLast,
  slotClass,
  textStyle,
  layoutKey,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<PageView>({ pages: [], index: 0 });
  const [turner] = useState(() => new PageTurner(setView));

  useLayoutEffect(() => {
    turner.setInterceptTap(interceptTap);
    turner.setPinLast(!!pinToLast);
  });

  // Declared before the blocks effect so the first layout finds the elements; both run before the browser paints.
  useLayoutEffect(() => {
    if (areaRef.current && textRef.current) return turner.attach(areaRef.current, textRef.current);
  }, [turner]);

  useLayoutEffect(() => {
    turner.setBlocks(blocks, focus);
    // Only new text moves the reader, not a new focus on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turner, blocks]);

  // After each draw, make sure the page really fits (see PageTurner.checkFit).
  useLayoutEffect(() => {
    turner.checkFit();
  }, [turner, view]);

  // New text settings: paginate again (the first layout happens on attach).
  const layoutKeyRef = useRef(layoutKey);
  useLayoutEffect(() => {
    if (layoutKey === layoutKeyRef.current) return;
    layoutKeyRef.current = layoutKey;
    turner.refresh();
  }, [turner, layoutKey]);

  const count = Math.max(view.pages.length, 1);
  const current = Math.min(view.index, count - 1);
  const isLast = current === count - 1;
  // No pages until the first layout (which waits for the web fonts).
  const loading = !view.pages.length;
  const fragments = loading ? [] : pageFragments(blocks, view.pages[current]);

  return (
    <div class="reader__body">
      <div
        class="reader__page"
        ref={areaRef}
        role="region"
        aria-label={t('reader.text')}
        style={textStyle}
      >
        <div class="reader__text" ref={textRef}>
          {loading && <p class="reader__loading ui-font">{t('reader.loading')}</p>}
          {fragments.map((fragment) => (
            <p
              key={fragment.block + ':' + fragment.start}
              class={blockClass(fragment.kind)}
              data-block={fragment.block}
              data-start={fragment.start}
              data-end={fragment.end}
            >
              {fragment.runs
                ? fragment.runs.map((run, i) => (
                    <span key={i} class={runClass(run.style)}>
                      {run.text}
                    </span>
                  ))
                : fragment.text}
            </p>
          ))}
        </div>
      </div>
      <div class={'reader__slot' + (slotClass ? ' ' + slotClass : '')}>
        {loading ? null : isLast ? (
          lastPageSlot
        ) : (
          <button type="button" class="reader__present" onClick={() => turner.last()}>
            {t('reader.backToPresent')} ›
          </button>
        )}
      </div>
      <div
        class="reader__indicator ui-font"
        aria-label={loading ? undefined : t('pager.status', { page: current + 1, count: count })}
      >
        {loading ? '' : current + 1 + ' / ' + count}
      </div>
    </div>
  );
}
