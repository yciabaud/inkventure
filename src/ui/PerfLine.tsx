// The last timing measured on this device (story S7.1), when Settings → About → Timings is on or with `?perf=1`: a
// small line at the top of the screen that taps go through.
import { useLastTiming, type PerfLabel } from '../app/perf';
import { t, type MessageKey } from '../i18n/i18n';

const LABELS: Record<PerfLabel, MessageKey> = {
  home: 'perf.home',
  library: 'perf.library',
  page: 'perf.page',
  turn: 'perf.turn',
};

export function PerfLine() {
  const timing = useLastTiming();
  if (!timing) return null;
  return (
    <p class="perf-line ui-font" data-testid="perf-line">
      {t(LABELS[timing.label], { ms: timing.ms })}
    </p>
  );
}
