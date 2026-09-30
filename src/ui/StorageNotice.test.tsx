import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryBackend } from '../storage/backend';
import { createStore } from '../storage/store';
import { StorageNotice } from './StorageNotice';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

describe('StorageNotice', () => {
  it('shows nothing while storage works', () => {
    render(<StorageNotice store={createStore(new MemoryBackend())} />, container);
    expect(container.innerHTML).toBe('');
  });

  it('warns when storage is not persistent, and can be dismissed', () => {
    render(
      <StorageNotice store={createStore(new MemoryBackend(), { persistent: false })} />,
      container,
    );
    expect(container.querySelector('[role=status]')?.textContent).toContain('not saving data');
    act(() => container.querySelector('button')!.click());
    expect(container.innerHTML).toBe('');
  });

  it('reports a full storage with a link to Settings', () => {
    const store = createStore(new MemoryBackend(10));
    act(() => {
      render(<StorageNotice store={store} />, container);
    });
    act(() => {
      expect(() => store.set('prefs', { locale: 'fr' })).toThrow(/^Storage full/);
    });
    expect(container.textContent).toContain('Storage is full');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('#/settings?s=data');
  });
});
