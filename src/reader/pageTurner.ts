// Page state and input handling for the paged text view, kept out of the component so the listeners (attached once)
// and the reading position are plain mutable state.
import { perfNow } from '../app/perf';
import { measureBlocks, type Measurement } from './measure';
import {
  pageIndexOf,
  paginate,
  type BlockMetrics,
  type Page,
  type Position,
  type ReaderBlock,
} from './paginator';

/** Share of the width, from the left, that turns back a page (Kindle convention: left 30 % back, right 70 % forward). */
export const PREV_ZONE = 0.3;
/** Minimum horizontal travel, in px, for a swipe. */
export const SWIPE_MIN = 40;
/**
 * Longest wait for the web fonts before the first layout. Waiting avoids drawing the page twice (fallback font, then
 * the real one), which costs an extra e-ink refresh; past this delay the text shows in the fallback font and is laid
 * out again when the fonts arrive.
 */
export const FONT_WAIT_MS = 2000;
/** Consecutive self-corrections allowed for one layout (see `checkFit`), so a measuring bug cannot loop. */
const MAX_REFITS = 2;
/** A swipe is followed by a click on the same element; ignore it. */
const CLICK_AFTER_SWIPE_MS = 600;

export interface PageView {
  pages: Page[];
  index: number;
  /** Width of the text column and the tallest a picture may be, in px, as laid out (`imageBox`). */
  width?: number;
  imageMaxHeight?: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Called before a tap or swipe turns the page; `point` (viewport coordinates) is given for taps only. */
export type TapInterceptor = (isLastPage: boolean, point?: Point) => boolean;

export class PageTurner {
  private interceptTap: TapInterceptor | undefined;
  /** Keep the last page open across re-layouts (the command field has focus, the keyboard may resize the page). */
  private pinLast = false;
  /** Px of the text area covered on the last page by its taller slot (the command bar). */
  private lastReserve = 0;
  private pages: Page[] = [];
  private index = 0;
  private blocks: ReaderBlock[] = [];
  // Where the reader is: the start of the page they last turned to. Re-pagination goes back to the page showing it,
  // so resizing back and forth returns to the same page.
  private anchor: Position = { block: 0, offset: 0 };
  private laidOut = '';
  private area: HTMLElement | null = null;
  private text: HTMLElement | null = null;
  private gesture: Point | null = null;
  private ignoreClickUntil = 0;
  private detach: (() => void) | null = null;
  private fontsRequested: Record<string, boolean> = {};
  /** A page turn the reader asked for, not yet drawn (timings, S7.1). */
  private turnAsked: number | null = null;
  /** 'waiting' until the fonts of the first layout are in (or FONT_WAIT_MS has passed). */
  private firstLayout: 'pending' | 'waiting' | 'done' = 'pending';
  /** Metrics of the blocks last measured, reused for unchanged blocks at the same width (a turn adds a few blocks). */
  private cache: {
    width: number;
    imageMaxHeight: number;
    blocks: ReaderBlock[];
    metrics: BlockMetrics[];
  } | null = null;
  /** Width of the text column and the tallest a picture may be, as last laid out. */
  private width = 0;
  private imageMaxHeight = 0;
  /** Layout the last self-corrections were for, and how many were made. */
  private refits = { key: '', count: 0 };

  constructor(private readonly onChange: (view: PageView) => void) {}

  /**
   * Called before a tap or swipe turns the page; returning true consumes it (e.g. to close a menu, or to answer a
   * "press any key" prompt on the last page).
   */
  setInterceptTap(intercept: TapInterceptor | undefined): void {
    this.interceptTap = intercept;
  }

  /** While pinned, every re-layout (e.g. the virtual keyboard shrinking the page) stays on the last page. */
  setPinLast(pin: boolean): void {
    if (pin === this.pinLast) return;
    this.pinLast = pin;
    if (pin) this.last();
  }

  /** The last page's slot covers the bottom `px` of the text area: that page holds less text. */
  setLastPageReserve(px: number): void {
    if (px === this.lastReserve) return;
    this.lastReserve = px;
    this.layout(true);
  }

  /** New text. With `focus`, opens on the page where that block starts (e.g. the echoed command of a new turn). */
  setBlocks(blocks: ReaderBlock[], focus?: number): void {
    this.blocks = blocks;
    if (focus !== undefined && focus >= 0) this.anchor = { block: focus, offset: 0 };
    this.layout(true);
  }

  turnTo(target: number): void {
    if (target < 0 || target >= this.pages.length || target === this.index) return;
    this.anchor = this.pages[target].start;
    this.index = target;
    this.emit();
  }

  turn(delta: number, point?: Point): void {
    if (this.interceptTap && this.interceptTap(this.index >= this.pages.length - 1, point)) return;
    const before = this.index;
    const asked = perfNow();
    this.turnTo(this.index + delta);
    if (this.index !== before) this.turnAsked = asked;
  }

  /** When the last page turn asked by the reader started (`perfNow()`), once; null when none is pending. */
  takeTurnAsked(): number | null {
    const asked = this.turnAsked;
    this.turnAsked = null;
    return asked;
  }

  first(): void {
    this.turnTo(0);
  }

  last(): void {
    this.turnTo(this.pages.length - 1);
  }

  /** Measures the text area and lays the blocks out again; skipped when its size is unchanged unless `force`. */
  layout(force: boolean): void {
    const area = this.area;
    const text = this.text;
    if (!area || !text) return;
    const style = window.getComputedStyle(area);
    const height =
      area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const width = text.clientWidth;
    if (height <= 0 || width <= 0) return;
    const key = width + 'x' + height;
    if (!force && key === this.laidOut) return;
    if (
      this.firstLayout !== 'done' &&
      !this.fontsReadyForFirstLayout(area, text.className, width)
    ) {
      return;
    }
    this.laidOut = key;
    // A picture fits on any page, even the last one under the command bar.
    const imageMaxHeight = Math.max(height - this.lastReserve, 1);
    this.width = width;
    this.imageMaxHeight = imageMaxHeight;

    const measured = this.measure(area, text.className, width, imageMaxHeight);
    // Turns (an echoed command and its reply) are kept on one page when they fit.
    const turns: boolean[] = [];
    for (let i = 0; i < this.blocks.length; i++) turns.push(this.blocks[i].kind === 'input');
    this.pages = paginate(
      measured.metrics,
      height,
      turns,
      this.lastReserve > 0 ? Math.max(height - this.lastReserve, 1) : undefined,
    );
    this.index = this.pinLast ? this.pages.length - 1 : pageIndexOf(this.pages, this.anchor);
    if (this.pinLast && this.pages.length) this.anchor = this.pages[this.index].start;
    this.emit();
    this.awaitFonts(measured.fonts);
  }

  /**
   * Measures the blocks, reusing the metrics of the unchanged leading blocks when the width is the same (and the
   * picture height cap too, when a picture is among them).
   */
  private measure(
    area: HTMLElement,
    className: string,
    width: number,
    imageMaxHeight: number,
  ): Measurement {
    const blocks = this.blocks;
    const cache = this.cache;
    let same = 0;
    if (cache && cache.width === width) {
      const n = Math.min(cache.blocks.length, blocks.length);
      const capped = cache.imageMaxHeight === imageMaxHeight;
      while (same < n && cache.blocks[same] === blocks[same] && (capped || !blocks[same].image))
        same++;
      if (same === blocks.length && same === cache.blocks.length) {
        return { metrics: cache.metrics, fonts: [] };
      }
    }
    // Measure again from the last unchanged block: its gap to the first new block is part of its metrics.
    const from = Math.max(same - 1, 0);
    const measured = measureBlocks(area, className, width, blocks.slice(from), imageMaxHeight);
    const metrics =
      cache && from > 0 ? cache.metrics.slice(0, from).concat(measured.metrics) : measured.metrics;
    this.cache = {
      width: width,
      imageMaxHeight: imageMaxHeight,
      blocks: blocks,
      metrics: metrics,
    };
    return { metrics: metrics, fonts: measured.fonts };
  }

  /**
   * Called after the page is drawn: if its text overflows the text area, the page was laid out with other metrics than
   * the ones it is drawn with (typically a web font that finished loading in between), so measure again. Bounded by
   * MAX_REFITS per layout.
   */
  checkFit(): void {
    const area = this.area;
    const text = this.text;
    if (!area || !text || this.firstLayout !== 'done' || !this.pages.length) return;
    const last = text.lastElementChild;
    if (!last) return;
    const style = window.getComputedStyle(area);
    const reserve = this.index === this.pages.length - 1 ? this.lastReserve : 0;
    const bottom = area.getBoundingClientRect().bottom - parseFloat(style.paddingBottom) - reserve;
    if (last.getBoundingClientRect().bottom - bottom <= 0.5) return;
    const key = this.laidOut + ':' + this.blocks.length + ':' + this.index;
    if (this.refits.key !== key) this.refits = { key: key, count: 0 };
    if (this.refits.count >= MAX_REFITS) return;
    this.refits.count++;
    this.remeasure();
  }

  /** Measures everything again, keeping the reading position (text settings changed). */
  refresh(): void {
    this.remeasure();
  }

  /** Measures everything again (fonts changed). */
  private remeasure(): void {
    this.cache = null;
    this.layout(true);
  }

  /**
   * Before the first layout: true once the fonts the text is set in have loaded. Until then, asks for them and lays
   * out when they arrive or after FONT_WAIT_MS, whichever comes first.
   */
  private fontsReadyForFirstLayout(area: HTMLElement, className: string, width: number): boolean {
    if (this.firstLayout === 'waiting') return false;
    // One block of each kind is enough to know the fonts (pictures have none).
    const sample: ReaderBlock[] = [];
    const kinds: Record<string, boolean> = {};
    for (let i = 0; i < this.blocks.length; i++) {
      if (kinds[this.blocks[i].kind] || this.blocks[i].image) continue;
      kinds[this.blocks[i].kind] = true;
      sample.push(this.blocks[i]);
    }
    if (!this.blocks.length) return false;

    const loads = sample.length
      ? this.loadFonts(measureBlocks(area, className, width, sample, 1).fonts)
      : [];
    if (!loads.length) {
      this.firstLayout = 'done';
      return true;
    }

    this.firstLayout = 'waiting';
    let left = loads.length;
    // Past FONT_WAIT_MS the text shows in the fallback font; it is laid out again when the fonts arrive.
    const timer = window.setTimeout(() => {
      this.firstLayout = 'done';
      this.remeasure();
    }, FONT_WAIT_MS);
    for (let i = 0; i < loads.length; i++) {
      loads[i].then(() => {
        if (--left > 0) return;
        window.clearTimeout(timer);
        this.firstLayout = 'done';
        this.remeasure();
      });
    }
    return false;
  }

  /**
   * Asks for the fonts not requested yet; returns a promise per font, settled once it has loaded (or failed).
   * `load()` rather than `check()` or FontFaceSet events: on WebKit (CI), `check()` reported the fonts available and
   * `ready` resolved before they had loaded, and no `loadingdone` came in time, so pages stayed laid out in the
   * fallback font. A font already loaded settles at once.
   */
  private loadFonts(fonts: string[]): Array<Promise<void>> {
    const set = document.fonts;
    const loads: Array<Promise<void>> = [];
    if (!set || typeof set.load !== 'function') return loads;
    const settle = () => undefined;
    for (let i = 0; i < fonts.length; i++) {
      if (this.fontsRequested[fonts[i]]) continue;
      this.fontsRequested[fonts[i]] = true;
      try {
        loads.push(set.load(fonts[i]).then(settle, settle));
      } catch {
        // unparsable font value
      }
    }
    return loads;
  }

  /**
   * Web fonts change every line. When the text uses a font not requested before (the first layout found other kinds
   * of blocks, or a setting changed the font), loads it and lays out again once it has arrived.
   */
  private awaitFonts(fonts: string[]): void {
    const loads = this.loadFonts(fonts);
    for (let i = 0; i < loads.length; i++) loads[i].then(() => this.remeasure());
  }

  /** Listens to taps, swipes, keys, resizes and font loads. `area` is the tap area, `text` the text column. */
  attach(area: HTMLElement, text: HTMLElement): () => void {
    if (this.detach) this.detach();
    this.area = area;
    this.text = text;

    const relayout = () => this.layout(false);
    const relayoutAll = () => this.remeasure();

    // Swipes are detected from the events themselves: the Kindle fires touch and pointer events although
    // `ontouchstart` is absent (SPEC §2.2). Whichever event arrives first handles the gesture.
    const onPointerDown = (event: PointerEvent) => this.down(event.clientX, event.clientY);
    const onPointerUp = (event: PointerEvent) => this.up(event.clientX, event.clientY);
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (touch) this.down(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (event: TouchEvent) => {
      const touch = event.changedTouches[0];
      if (touch) this.up(touch.clientX, touch.clientY);
    };
    const onClick = (event: MouseEvent) => {
      if (Date.now() < this.ignoreClickUntil) return;
      const rect = area.getBoundingClientRect();
      this.turn(event.clientX - rect.left < rect.width * PREV_ZONE ? -1 : 1, {
        x: event.clientX,
        y: event.clientY,
      });
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target && target.tagName;
      if (event.defaultPrevented || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
        return;
      const key = event.key;
      if (key === 'ArrowRight' || key === 'Right' || key === 'PageDown') this.turn(1);
      else if (key === 'ArrowLeft' || key === 'Left' || key === 'PageUp') this.turn(-1);
      else return;
      event.preventDefault();
    };

    area.addEventListener('pointerdown', onPointerDown);
    area.addEventListener('pointerup', onPointerUp);
    area.addEventListener('touchstart', onTouchStart);
    area.addEventListener('touchend', onTouchEnd);
    area.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    // The text area also changes size without a window resize (top bar, notices, later the keyboard).
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
    if (observer) observer.observe(area);
    // Web fonts arrive after the first layout and change every line. WebKit may resolve `ready` early and fire
    // `loadingdone` late or never, so each face's own `loaded` promise is watched too.
    const fonts = document.fonts;
    if (fonts) {
      if (fonts.addEventListener) fonts.addEventListener('loadingdone', relayoutAll);
      if (fonts.ready) fonts.ready.then(relayoutAll);
      if (typeof fonts.forEach === 'function') {
        fonts.forEach((face) => {
          if (face.status !== 'loaded' && face.loaded)
            face.loaded.then(relayoutAll, () => undefined);
        });
      }
    }

    this.detach = () => {
      area.removeEventListener('pointerdown', onPointerDown);
      area.removeEventListener('pointerup', onPointerUp);
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchend', onTouchEnd);
      area.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', relayout);
      window.removeEventListener('orientationchange', relayout);
      if (observer) observer.disconnect();
      if (fonts && fonts.removeEventListener) fonts.removeEventListener('loadingdone', relayoutAll);
      this.area = null;
      this.text = null;
      this.detach = null;
    };
    this.layout(true);
    return this.detach;
  }

  private down(x: number, y: number): void {
    this.gesture = { x: x, y: y };
  }

  private up(x: number, y: number): void {
    const start = this.gesture;
    if (!start) return;
    this.gesture = null;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      this.ignoreClickUntil = Date.now() + CLICK_AFTER_SWIPE_MS;
      this.turn(dx < 0 ? 1 : -1);
    }
  }

  private emit(): void {
    this.onChange({
      pages: this.pages,
      index: this.index,
      width: this.width,
      imageMaxHeight: this.imageMaxHeight,
    });
  }
}
