import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface Area {
  width: number;
  height: number;
}

/** Before the list area is measured (and in jsdom). */
export const DEFAULT_AREA: Area = { width: 568, height: 480 };

/**
 * Size of a list area, measured after every render (it shrinks when a pager appears) and on resize, so a list shows
 * as many rows as fit instead of scrolling.
 */
export function useArea(): [Area, RefObject<HTMLDivElement>] {
  const [area, setArea] = useState(DEFAULT_AREA);
  const [, setTick] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = list.current;
    if (!element || !element.clientHeight) return;
    if (element.clientWidth !== area.width || element.clientHeight !== area.height) {
      setArea({ width: element.clientWidth, height: element.clientHeight });
    }
  });
  useEffect(() => {
    const remeasure = () => setTick((tick) => tick + 1);
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);
  return [area, list];
}
