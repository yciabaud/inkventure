import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import { getStore } from '../../storage';
import { StorageNotice } from '../../ui/StorageNotice';
import { TopBar } from '../../ui/TopBar';

interface Props {
  /** Content of the top zone: the status line, or the story title. */
  heading: ComponentChildren;
  /**
   * The reader body. `closeBar` closes the app top bar if it is open and says whether it was: a tap on the page then
   * only closes the bar.
   */
  children: (closeBar: () => boolean) => ComponentChildren;
}

/** Full-screen reader chrome: a top zone that shows the app's top bar on tap (later the reader menu, S1.6). */
export function ReaderFrame({ heading, children }: Props) {
  const [barOpen, setBarOpen] = useState(false);
  const closeBar = () => {
    if (!barOpen) return false;
    setBarOpen(false);
    return true;
  };
  return (
    <div class="reader">
      <button
        type="button"
        class="reader__top ui-font"
        aria-expanded={barOpen}
        aria-label={t('reader.navigation')}
        onClick={() => setBarOpen(!barOpen)}
      >
        {heading}
        <span aria-hidden="true">⋯</span>
      </button>
      {barOpen && (
        <div class="reader__bar">
          <TopBar current="play" />
        </div>
      )}
      <StorageNotice store={getStore()} />
      {children(closeBar)}
    </div>
  );
}
