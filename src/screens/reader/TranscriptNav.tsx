import { t } from '../../i18n/i18n';
import type { PageNav } from '../../reader/PagedText';

/** Under every page of the Transcript view: jump to its start or end, or go back to the game. */
export function TranscriptNav({ nav, onClose }: { nav: PageNav; onClose: () => void }) {
  return (
    <div class="reader__transcript-nav ui-font" role="group" aria-label={t('transcript.title')}>
      <button type="button" class="reader__present" disabled={nav.isFirst} onClick={nav.first}>
        « {t('transcript.start')}
      </button>
      <button type="button" class="reader__present" disabled={nav.isLast} onClick={nav.last}>
        {t('transcript.end')} »
      </button>
      <button type="button" class="reader__present" onClick={onClose}>
        {t('transcript.close')}
      </button>
    </div>
  );
}
