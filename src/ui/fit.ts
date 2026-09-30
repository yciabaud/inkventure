// "Priority+" rows: as many items as fit on one line, in order, the rest going to a dialog.
import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';

/** Horizontal gap between two items of a row (`.chips > * + *` margin). */
export const ROW_GAP = 6;

/**
 * How many of `widths` (in order) fit in `available` pixels next to a reserved item of width `reserve` (the "More"
 * button, 0 if none), with `gap` between items. Never fewer than `min`.
 */
export function fitCount(
  widths: number[],
  available: number,
  reserve: number,
  gap: number = ROW_GAP,
  min = 0,
): number {
  let used = reserve;
  let count = 0;
  for (let i = 0; i < widths.length; i++) {
    const next = used + (used > 0 ? gap : 0) + widths[i];
    if (next > available) break;
    used = next;
    count++;
  }
  return Math.max(count, Math.min(min, widths.length));
}

/** Natural width of an element, even when it is shrunk with an ellipsis (content + padding + border). */
function naturalWidth(element: HTMLElement): number {
  return element.scrollWidth + element.offsetWidth - element.clientWidth;
}

/**
 * Number of `[data-fit]` children of `row` that fit on its line next to its `[data-fit-reserve]` child. Items past the
 * count must stay in the row with the `fit-hidden` class (invisible, still measurable). Re-measured after every
 * render, on resize and when web fonts finish loading.
 */
export function useFitCount(row: RefObject<HTMLElement>, min = 0): number {
  const [count, setCount] = useState(Infinity);
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const items = element.querySelectorAll<HTMLElement>('[data-fit]');
    const reserved = element.querySelector<HTMLElement>('[data-fit-reserve]');
    const widths: number[] = [];
    for (let i = 0; i < items.length; i++) widths.push(naturalWidth(items[i]));
    const fitted = fitCount(
      widths,
      element.clientWidth,
      reserved ? naturalWidth(reserved) : 0,
      ROW_GAP,
      min,
    );
    const next = fitted === items.length ? Infinity : fitted;
    if (next !== count) setCount(next);
  });

  useEffect(() => {
    const remeasure = () => setTick((tick) => tick + 1);
    window.addEventListener('resize', remeasure);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts && fonts.addEventListener) fonts.addEventListener('loadingdone', remeasure);
    return () => {
      window.removeEventListener('resize', remeasure);
      if (fonts && fonts.removeEventListener) fonts.removeEventListener('loadingdone', remeasure);
    };
  }, []);

  return count;
}
