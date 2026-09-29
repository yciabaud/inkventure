import { render } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  let container: HTMLElement;

  afterEach(() => {
    render(null, container);
    container.remove();
  });

  it('renders the placeholder page in jsdom', () => {
    expect(navigator.userAgent).toContain('jsdom');
    container = document.createElement('div');
    document.body.appendChild(container);

    render(<App />, container);

    expect(container.querySelector('h1')?.textContent).toBe('Inkventure');
  });
});
