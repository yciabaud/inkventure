import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n/i18n';
import { blockClass, IMAGE_CLASS, runClass } from './measure';
import { PageTurner, type PageView, type TapInterceptor } from './pageTurner';
import { imageBox, pageFragments, type Fragment, type ReaderBlock } from './paginator';

/**
 * Height in px of the slot under the text ("Back to the present", the choices or input of the demo). The text area is
 * the same on every page, so it never has to be measured again when turning pages.
 */
export const SLOT_HEIGHT = 64;

/** Where the reader is, and how to jump to either end (for `pageSlot`). */
export interface PageNav {
  isFirst: boolean;
  isLast: boolean;
  first: () => void;
  last: () => void;
}

interface Props {
  blocks: ReaderBlock[];
  /** Shown under the text on the last page only (command bar, choices). */
  lastPageSlot?: ComponentChildren;
  /** Shown under the text on every page instead of `lastPageSlot` and "Back to the present" (read-only views). */
  pageSlot?: (nav: PageNav) => ComponentChildren;
  /** Called before a tap or swipe turns the page; returning true consumes it (e.g. to close a menu). */
  interceptTap?: TapInterceptor;
  /** Stay on the last page across re-layouts (the command field has focus). */
  pinToLast?: boolean;
  /**
   * Height in px of the slot on the last page, when it needs more than the `SLOT_HEIGHT` of the others (the command
   * bar): it then covers the bottom of the text area, which holds less text on that page.
   */
  lastSlotHeight?: number;
  /** Inline style of the text area (reader settings: font, size, spacing, margins, alignment). */
  textStyle?: Record<string, string>;
  /** Changes whenever `textStyle` changes the layout: the text is paginated again, keeping the reading position. */
  layoutKey?: string;
  /** When the blocks change, open on the page where this block starts (the echoed command of a new turn). */
  focus?: number;
  /** The data of picture `id` (image blocks), or null: its alt text shows in its place. */
  imageUrl?: (id: number) => string | null;
}

/** An image block: the picture at the size it was laid out with, in grayscale (CSS), or its alt text in its box. */
function Picture({
  fragment,
  view,
  imageUrl,
}: {
  fragment: Fragment;
  view: PageView;
  imageUrl?: (id: number) => string | null;
}) {
  const image = fragment.image;
  if (!image) return null;
  const box = imageBox(image, view.width || image.width, view.imageMaxHeight || image.height);
  const size = { width: box.width + 'px', height: box.height + 'px' };
  const src = imageUrl ? imageUrl(image.id) : null;
  return (
    <div
      class={blockClass(fragment.kind)}
      data-block={fragment.block}
      data-start={fragment.start}
      data-end={fragment.end}
    >
      {src ? (
        <img
          class={IMAGE_CLASS}
          src={src}
          alt={image.alt || ''}
          width={box.width}
          height={box.height}
          style={size}
        />
      ) : (
        <div class={IMAGE_CLASS + ' ' + IMAGE_CLASS + '--missing'} style={size}>
          {image.alt || ''}
        </div>
      )}
    </div>
  );
}

/**
 * Game text laid out in pages that exactly fit the text area (no scrolling), turned by tap zones, swipes or the
 * arrow keys. The reading position survives re-pagination (resize, rotation, font changes).
 */
export function PagedText({
  blocks,
  lastPageSlot,
  pageSlot,
  interceptTap,
  focus,
  pinToLast,
  lastSlotHeight,
  textStyle,
  layoutKey,
  imageUrl,
}: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<PageView>({ pages: [], index: 0 });
  const [turner] = useState(() => new PageTurner(setView));

  const reserve = lastSlotHeight && lastSlotHeight > SLOT_HEIGHT ? lastSlotHeight - SLOT_HEIGHT : 0;

  useLayoutEffect(() => {
    turner.setInterceptTap(interceptTap);
    turner.setPinLast(!!pinToLast);
    turner.setLastPageReserve(reserve);
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
          {fragments.map((fragment) =>
            fragment.image ? (
              <Picture
                key={fragment.block + ':' + fragment.start}
                fragment={fragment}
                view={view}
                imageUrl={imageUrl}
              />
            ) : (
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
            ),
          )}
        </div>
      </div>
      <div
        class={'reader__slot' + (isLast && reserve ? ' reader__slot--raised' : '')}
        style={
          isLast && reserve && !loading
            ? { height: lastSlotHeight + 'px', marginTop: -reserve + 'px' }
            : { height: SLOT_HEIGHT + 'px' }
        }
      >
        {loading ? null : pageSlot ? (
          pageSlot({
            isFirst: current === 0,
            isLast: isLast,
            first: () => turner.first(),
            last: () => turner.last(),
          })
        ) : isLast ? (
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
