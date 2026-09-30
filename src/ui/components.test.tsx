import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cover } from './Cover';
import { Menu } from './Dialog';
import { ErrorPage } from './ErrorPage';
import { Pager } from './Pager';
import { REFRESH_STEP_MS, refreshScreen } from './refreshScreen';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('Pager', () => {
  const hrefFor = (n: number) => '#/library?page=' + n;

  it('links to the previous and next pages', () => {
    render(<Pager page={2} pageCount={3} hrefFor={hrefFor} />, container);
    expect(container.querySelector('a[rel=prev]')?.getAttribute('href')).toBe('#/library?page=1');
    expect(container.querySelector('a[rel=next]')?.getAttribute('href')).toBe('#/library?page=3');
    expect(container.querySelector('.pager__status')?.textContent).toBe('2 / 3');
  });

  it('disables the buttons at the edges and clamps the page', () => {
    render(<Pager page={9} pageCount={3} hrefFor={hrefFor} />, container);
    expect(container.querySelector('a[rel=next]')).toBeNull();
    expect(container.querySelectorAll('[aria-disabled=true]').length).toBe(1);
    expect(container.querySelector('.pager__status')?.textContent).toBe('3 / 3');
  });

  it('renders buttons calling onPage instead of links when given', () => {
    const pages: number[] = [];
    render(<Pager page={2} pageCount={3} onPage={(n) => pages.push(n)} />, container);
    expect(container.querySelector('a')).toBeNull();
    const buttons = container.querySelectorAll('button');
    buttons[0].click();
    buttons[1].click();
    expect(pages).toEqual([1, 3]);
  });

  it('renders nothing for a single page', () => {
    render(<Pager page={1} pageCount={1} hrefFor={hrefFor} />, container);
    expect(container.innerHTML).toBe('');
  });
});

describe('Cover', () => {
  it('renders a typographic cover without image', () => {
    render(<Cover title="Zork I" author="Infocom" />, container);
    const cover = container.querySelector('.cover--typo');
    expect(cover?.getAttribute('aria-label')).toBe('Zork I');
    expect(cover?.textContent).toContain('by Infocom');
  });

  it('falls back to the typographic cover when the image fails', () => {
    render(
      <Cover title="Zork I" author="Infocom" imageUrl="https://example.test/x.png" />,
      container,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    act(() => {
      img!.dispatchEvent(new Event('error'));
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.cover--typo')).not.toBeNull();
  });
});

describe('Menu', () => {
  it('runs the selected action and closes', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <Menu title="Menu" items={[{ label: 'Refresh screen', onSelect }]} onClose={onClose} />,
      container,
    );
    const item = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Refresh screen',
    );
    act(() => item!.click());
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape and on the backdrop', () => {
    const onClose = vi.fn();
    act(() => {
      render(<Menu title="Menu" items={[]} onClose={onClose} />, container);
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    act(() => (container.querySelector('.dialog-backdrop') as HTMLElement).click());
    act(() => (container.querySelector('.dialog') as HTMLElement).click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ErrorPage', () => {
  it('always offers a way back Home', () => {
    render(<ErrorPage message="Download failed." />, container);
    expect(container.querySelector('[role=alert]')?.textContent).toContain('Download failed.');
    expect(container.querySelector('a[href="#/home"]')).not.toBeNull();
  });
});

describe('refreshScreen', () => {
  it('flashes black then white, then cleans up', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    refreshScreen(done);
    expect(document.querySelector('.screen-flash--black')).not.toBeNull();
    vi.advanceTimersByTime(REFRESH_STEP_MS);
    expect(document.querySelector('.screen-flash--white')).not.toBeNull();
    vi.advanceTimersByTime(REFRESH_STEP_MS);
    expect(document.querySelector('.screen-flash')).toBeNull();
    expect(done).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
