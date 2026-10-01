// Timings for measuring the app on a device (SPEC §10, §11.4; story S7.1), shown with Settings → About → Timings (or
// `?perf=1`): how long Home took to be ready, the Library's first results, a page turn in the reader and a game's
// turn, each in a small line at the top of the screen and in the console. A screen's time counts from the page's
// start when it is the first one shown, else from the address change that opened it.
import { useEffect, useRef, useState } from 'preact/hooks';

export type PerfLabel = 'home' | 'library' | 'page' | 'turn';

export interface PerfResult {
  label: PerfLabel;
  ms: number;
}

let enabled = false;
/** When the current screen started (ms since the page's start). */
let routeStart = 0;
let last: PerfResult | null = null;
const listeners: Array<(result: PerfResult) => void> = [];
const startedAt = Date.now();

/** Milliseconds since the page started loading. */
export function perfNow(): number {
  const performance = typeof window !== 'undefined' ? window.performance : undefined;
  return performance && performance.now ? performance.now() : Date.now() - startedAt;
}

export function setPerfEnabled(on: boolean): void {
  enabled = on;
}

export function perfEnabled(): boolean {
  return enabled;
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    routeStart = perfNow();
  });
}

/** Records a timing, from `start` (by default the current screen's start). Ignored when timings are off. */
export function measured(label: PerfLabel, start = routeStart): void {
  reportTiming(label, perfNow() - start);
}

/** Records a timing already measured (ms). Ignored when timings are off. */
export function reportTiming(label: PerfLabel, ms: number): void {
  if (!enabled) return;
  const result = { label: label, ms: Math.max(0, Math.round(ms)) };
  last = result;
  console.info('[perf] ' + label + ': ' + result.ms + ' ms');
  for (const listener of listeners.slice()) listener(result);
}

/** The last timing (null before the first one). */
export function useLastTiming(): PerfResult | null {
  const [result, setResult] = useState(last);
  useEffect(() => {
    listeners.push(setResult);
    return () => {
      const at = listeners.indexOf(setResult);
      if (at >= 0) listeners.splice(at, 1);
    };
  }, []);
  return result;
}

/** Records `label` once, the first time `ready` is true after the component mounted. */
export function useReadyTiming(label: PerfLabel, ready: boolean): void {
  const doneRef = useRef(false);
  useEffect(() => {
    if (!ready || doneRef.current) return;
    doneRef.current = true;
    measured(label);
  }, [label, ready]);
}
