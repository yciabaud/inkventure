// Page state and input handling for the paged text view, kept out of the component so the listeners (attached once)
// and the reading position are plain mutable state.
import { measureBlocks } from './measure';
import { pageIndexOf, paginate, type Page, type Position, type ReaderBlock } from './paginator';

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
/** A swipe is followed by a click on the same element; ignore it. */
const CLICK_AFTER_SWIPE_MS = 600;

export interface PageView {
  pages: Page[];
  index: number;
}

interface Point {
  x: number;
  y: number;
}

export class PageTurner {
  private interceptTap: (() => boolean) | undefined;
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
  private fontsPending: Record<string, boolean> = {};
  /** 'waiting' until the fonts of the first layout are in (or FONT_WAIT_MS has passed). */
  private firstLayout: 'pending' | 'waiting' | 'done' = 'pending';

  constructor(private readonly onChange: (view: PageView) => void) {}

  /** Called before a tap or swipe turns the page; returning true consumes it (e.g. to close a menu). */
  setInterceptTap(intercept: (() => boolean) | undefined): void {
    this.interceptTap = intercept;
  }

  setBlocks(blocks: ReaderBlock[]): void {
    this.blocks = blocks;
    this.layout(true);
  }

  turnTo(target: number): void {
    if (target < 0 || target >= this.pages.length || target === this.index) return;
    this.anchor = this.pages[target].start;
    this.index = target;
    this.emit();
  }

  turn(delta: number): void {
    if (this.interceptTap && this.interceptTap()) return;
    this.turnTo(this.index + delta);
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

    const measured = measureBlocks(area, text.className, width, this.blocks);
    this.pages = paginate(measured.metrics, height);
    this.index = pageIndexOf(this.pages, this.anchor);
    this.emit();
    this.awaitFonts(measured.fonts);
  }

  /**
   * Before the first layout: true when the fonts the text is set in are available. Otherwise starts loading them and
   * lays out when they arrive or after FONT_WAIT_MS, whichever comes first.
   */
  private fontsReadyForFirstLayout(area: HTMLElement, className: string, width: number): boolean {
    if (this.firstLayout === 'waiting') return false;
    // One block of each kind is enough to know the fonts.
    const sample: ReaderBlock[] = [];
    const kinds: Record<string, boolean> = {};
    for (let i = 0; i < this.blocks.length; i++) {
      if (kinds[this.blocks[i].kind]) continue;
      kinds[this.blocks[i].kind] = true;
      sample.push(this.blocks[i]);
    }
    if (!sample.length) return false;

    const set = document.fonts;
    const missing = this.missingFonts(measureBlocks(area, className, width, sample).fonts);
    if (!set || !missing.length) {
      this.firstLayout = 'done';
      return true;
    }

    this.firstLayout = 'waiting';
    let left = missing.length;
    const go = () => {
      if (this.firstLayout === 'done') return;
      this.firstLayout = 'done';
      window.clearTimeout(timer);
      this.layout(true);
    };
    const timer = window.setTimeout(go, FONT_WAIT_MS);
    const loaded = () => {
      left--;
      if (left <= 0) go();
    };
    for (let i = 0; i < missing.length; i++) set.load(missing[i]).then(loaded, loaded);
    return false;
  }

  /** The fonts among `fonts` that still have to load (none when the browser cannot tell). */
  private missingFonts(fonts: string[]): string[] {
    const set = document.fonts;
    const missing: string[] = [];
    if (!set || typeof set.load !== 'function' || typeof set.check !== 'function') return missing;
    for (let i = 0; i < fonts.length; i++) {
      try {
        if (!set.check(fonts[i])) missing.push(fonts[i]);
      } catch {
        // unparsable font value
      }
    }
    return missing;
  }

  /**
   * Web fonts change every line. When the text is set in a font that is not loaded yet (the first layout gave up
   * waiting, or a setting changed the font), asks for it and lays out again once it arrives. FontFaceSet events alone are not enough: WebKit
   * resolved `fonts.ready` before the download started and fired no `loadingdone` in time (CI, S1.1).
   */
  private awaitFonts(fonts: string[]): void {
    const missing = this.missingFonts(fonts);
    for (let i = 0; i < missing.length; i++) {
      const font = missing[i];
      if (this.fontsPending[font]) continue;
      this.fontsPending[font] = true;
      const done = () => {
        delete this.fontsPending[font];
        this.layout(true);
      };
      document.fonts.load(font).then(done, done);
    }
  }

  /** Listens to taps, swipes, keys, resizes and font loads. `area` is the tap area, `text` the text column. */
  attach(area: HTMLElement, text: HTMLElement): () => void {
    if (this.detach) this.detach();
    this.area = area;
    this.text = text;

    const relayout = () => this.layout(false);
    const relayoutAll = () => this.layout(true);

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
      this.turn(event.clientX - rect.left < rect.width * PREV_ZONE ? -1 : 1);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
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
    // Web fonts arrive after the first layout and change every line.
    const fonts = document.fonts;
    if (fonts) {
      if (fonts.addEventListener) fonts.addEventListener('loadingdone', relayoutAll);
      if (fonts.ready) fonts.ready.then(relayoutAll);
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
    this.onChange({ pages: this.pages, index: this.index });
  }
}
