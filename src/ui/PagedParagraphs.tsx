// Text that never scrolls (SPEC §3.2): paragraphs laid out in columns as wide as their area, one column per page,
// turned with the pager. Used for game blurbs (S3.3) and the help page (S4.1).
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useArea } from '../screens/library/useArea';
import { Pager } from './Pager';

/** Space between two columns (pages). */
const COLUMN_GAP = 24;

/** Height of the pager under the text (`.pager`: 24 px padding and 48 px buttons). */
const PAGER_HEIGHT = 72;

/** The text area never gets smaller than this, even on a short screen (it then overflows a little). */
const MIN_HEIGHT = 96;

/**
 * The area (text and pager together) is measured as a whole, so showing the pager never changes what is measured:
 * the text first gets the full height; if it does not fit, it gets the height left above the pager, for as long as
 * the area keeps its size. The page count is the column where the text ends, found with an empty marker after its
 * last word (WebKit does not widen `scrollWidth` for overflowing columns).
 */
export function PagedParagraphs({ paragraphs }: { paragraphs: string[] }) {
  const [area, areaRef] = useArea();
  const columns = useRef<HTMLDivElement>(null);
  const endMark = useRef<HTMLSpanElement>(null);
  const size = area.width + 'x' + area.height;
  // The area size for which the text was found too long for one page.
  const [pagedFor, setPagedFor] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const paged = pagedFor === size;
  const height = Math.max(paged ? area.height - PAGER_HEIGHT : area.height, MIN_HEIGHT);
  const step = area.width + COLUMN_GAP;

  // Measured after every render: the columns change with the area and the text. State only changes when the
  // measure does, and `paged` only goes from false to true for a given area size, so this settles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = columns.current;
    const end = endMark.current;
    if (!element || !end) return;
    // Both boxes move with the transform, so the page shown does not matter.
    const offset = end.getBoundingClientRect().left - element.getBoundingClientRect().left;
    const count = Math.max(1, Math.floor(offset / step) + 1);
    if (!paged) {
      if (count > 1) setPagedFor(size);
      return;
    }
    if (count !== pageCount) setPageCount(count);
    if (page > count) setPage(count);
  });

  // Web fonts change the layout without a render: measure again once they are loaded.
  const [, setTick] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || !fonts.addEventListener) return;
    const remeasure = () => {
      setPagedFor('');
      setTick((tick) => tick + 1);
    };
    fonts.addEventListener('loadingdone', remeasure);
    return () => fonts.removeEventListener('loadingdone', remeasure);
  }, []);

  return (
    <div class="paged" ref={areaRef}>
      <div class="paged__window" style={{ height: height + 'px' }}>
        <div
          class="paged__columns"
          ref={columns}
          style={{
            height: height + 'px',
            columnWidth: area.width + 'px',
            columnGap: COLUMN_GAP + 'px',
            transform: 'translateX(' + -((paged ? page : 1) - 1) * step + 'px)',
          }}
        >
          {paragraphs.map((text, i) => (
            <p key={i}>
              {text}
              {i === paragraphs.length - 1 && <span ref={endMark} />}
            </p>
          ))}
        </div>
      </div>
      {paged && <Pager page={page} pageCount={pageCount} onPage={setPage} />}
    </div>
  );
}
