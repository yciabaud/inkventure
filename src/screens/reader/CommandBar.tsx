import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n/i18n';
import type { AnswerChip } from '../../reader/commands/answers';
import { applyChip, applyNoun, awaitsObject, browseHistory } from '../../reader/commands/compose';
import type { Chip, VerbTable } from '../../reader/commands/verbs';
import { Dialog } from '../../ui/Dialog';
import { useFitCount } from '../../ui/fit';

/** Directions always on the bar; the others (diagonals, in / out) are in the directions dialog. */
const MAIN_DIRECTIONS = ['n', 's', 'e', 'w', 'up', 'down'];
/**
 * Verbs on the bar, by priority; the others are in the "More" dialog. On narrow screens the directions and verbs that
 * do not fit move to their dialog, from the end of these lists.
 */
const MAIN_VERBS = ['look', 'examine', 'take', 'inventory'];

/**
 * Height in px of the slot holding the bar on the last page (three rows of 48 px chips, gaps and padding). The same on
 * every turn, so the last page keeps its layout while the game answers.
 */
export const COMMAND_BAR_HEIGHT = 196;

interface Props {
  table: VerbTable;
  /** Objects recently mentioned, most recent first. */
  nouns: string[];
  /** The answers to a question the game asks (Yes / No, numbered options): first in the directions row. */
  answers?: AnswerChip[];
  /** Commands the game names in capitals ("type HELP"): first in the verbs row (S1.19). */
  named?: Chip<string>[];
  field: string;
  onField: (field: string) => void;
  onSend: (command: string) => void;
  history: string[];
  maxLength?: number;
  /** The command field got or lost focus (the reader stays on the last page while it has it). */
  onFocusChange: (focused: boolean) => void;
}

/**
 * Tap-first command bar (SPEC §3.6): a row of directions, a row of verbs (or, after a verb ending with "…", the objects
 * to complete it), and the command field.
 */
export function CommandBar({
  table,
  nouns,
  answers = [],
  named = [],
  field,
  onField,
  onSend,
  history,
  maxLength,
  onFocusChange,
}: Props) {
  const [dialog, setDialog] = useState<'directions' | 'more' | null>(null);
  // Position in the history: history.length means "not browsing".
  const [position, setPosition] = useState(history.length);
  const directionsRow = useRef<HTMLDivElement>(null);
  const verbsRow = useRef<HTMLDivElement>(null);
  const nounsRow = useRef<HTMLDivElement>(null);
  const directionsShown = useFitCount(directionsRow);
  const verbsShown = useFitCount(verbsRow);
  // At least one object, shortened with an ellipsis if it is too long for the row.
  const nounsShown = useFitCount(nounsRow, 1);
  // The options' words are left out when they keep some answers off the row (numbers only, then).
  const answersKey = answers.map((a) => a.send + ':' + (a.detail || '')).join('|');
  const [compact, setCompact] = useState({ key: '', on: false });
  const short = compact.key === answersKey && compact.on;
  useLayoutEffect(() => {
    if (compact.key !== answersKey) setCompact({ key: answersKey, on: false });
    else if (!compact.on && directionsShown < answers.length)
      setCompact({ key: answersKey, on: true });
  }, [compact.key, compact.on, answersKey, directionsShown, answers.length]);

  function chip(item: Chip<string>) {
    setDialog(null);
    const action = applyChip(item);
    if ('send' in action) send(action.send);
    else onField(action.field);
  }

  function noun(word: string) {
    const action = applyNoun(field, word, table.verbs);
    if ('send' in action) send(action.send);
    else onField(action.field);
  }

  function send(command: string) {
    setPosition(history.length + 1);
    onSend(command);
  }

  function browse(step: -1 | 1) {
    const result = browseHistory(history, Math.min(position, history.length), step);
    setPosition(result.position);
    onField(result.field);
  }

  const waiting = awaitsObject(field, table.verbs);
  const directions = table.directions.filter((d) => MAIN_DIRECTIONS.indexOf(d.id) >= 0);
  const otherDirections = table.directions.filter((d) => MAIN_DIRECTIONS.indexOf(d.id) < 0);
  const verbs = MAIN_VERBS.map((id) => table.verbs.filter((v) => v.id === id)[0]).filter(
    (v) => !!v,
  );
  // The commands the game names come first; what does not fit goes to "More…", as on narrow screens.
  const rowVerbs: Chip<string>[] = (named as Chip<string>[]).concat(verbs);
  const otherVerbs = rowVerbs
    .slice(verbsShown)
    .concat(table.verbs.filter((v) => MAIN_VERBS.indexOf(v.id) < 0));

  return (
    <div class="command-bar ui-font">
      <div
        class="chips"
        role="group"
        aria-label={t(answers.length ? 'reader.answers' : 'reader.directions')}
        ref={directionsRow}
      >
        {answers.map((a, i) => (
          <button
            key={'answer:' + a.send}
            type="button"
            class={fitClass('chip chip--answer', i, directionsShown)}
            data-fit
            aria-label={a.detail ? a.label + ' — ' + a.detail : undefined}
            onClick={() => send(a.send)}
          >
            {a.detail && !short ? a.label + ' — ' + a.detail : a.label}
          </button>
        ))}
        {directions.map((d, i) => (
          <button
            key={d.id}
            type="button"
            class={fitClass('chip chip--direction', answers.length + i, directionsShown)}
            data-fit
            onClick={() => chip(d)}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          class="chip chip--more"
          data-fit-reserve
          aria-label={t('reader.moreDirections')}
          onClick={() => setDialog('directions')}
        >
          ⋯
        </button>
      </div>

      {waiting ? (
        <div class="chips" role="group" aria-label={t('reader.nouns')} ref={nounsRow}>
          {nouns.length ? (
            nouns.map((word, i) => (
              <button
                key={word}
                type="button"
                class={fitClass('chip chip--noun', i, nounsShown)}
                data-fit
                onClick={() => noun(word)}
              >
                {word}
              </button>
            ))
          ) : (
            <span class="chips__hint">{t('reader.noNouns')}</span>
          )}
          <button
            type="button"
            class="chip chip--more"
            data-fit-reserve
            aria-label={t('reader.cancelVerb')}
            onClick={() => onField('')}
          >
            ✕
          </button>
        </div>
      ) : (
        <div class="chips" role="group" aria-label={t('reader.verbs')} ref={verbsRow}>
          {rowVerbs.map((v, i) => (
            <button
              key={v.id}
              type="button"
              class={fitClass(i < named.length ? 'chip chip--named' : 'chip', i, verbsShown)}
              data-fit
              onClick={() => chip(v)}
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            class="chip chip--more"
            data-fit-reserve
            onClick={() => setDialog('more')}
          >
            {t('reader.more')}
          </button>
        </div>
      )}

      <form
        class="command"
        onSubmit={(event) => {
          event.preventDefault();
          send(field);
        }}
      >
        <span class="command__prompt" aria-hidden="true">
          &gt;
        </span>
        <input
          class="command__input"
          type="text"
          value={field}
          onInput={(event) => onField((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'Up') {
              event.preventDefault();
              browse(-1);
            } else if (event.key === 'ArrowDown' || event.key === 'Down') {
              event.preventDefault();
              browse(1);
            }
          }}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          aria-label={t('reader.command')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellcheck={false}
          maxLength={maxLength}
        />
        <button type="submit" class="command__send">
          {t('reader.send')}
        </button>
      </form>

      {dialog === 'directions' && (
        <Dialog title={t('reader.directions')} onClose={() => setDialog(null)}>
          <div class="chip-grid">
            {answers.slice(directionsShown).map((a) => (
              <button
                key={'answer:' + a.send}
                type="button"
                class="chip chip--answer"
                onClick={() => {
                  setDialog(null);
                  send(a.send);
                }}
              >
                {a.detail ? a.label + ' — ' + a.detail : a.label}
              </button>
            ))}
            {otherDirections.concat(directions).map((d) => (
              <button key={d.id} type="button" class="chip" onClick={() => chip(d)}>
                {d.label}
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {dialog === 'more' && (
        <Dialog title={t('reader.moreActions')} onClose={() => setDialog(null)}>
          <div class="chip-grid">
            {otherVerbs.map((v) => (
              <button key={v.id} type="button" class="chip" onClick={() => chip(v)}>
                {v.label}
              </button>
            ))}
            <button
              type="button"
              class="chip"
              disabled={!history.length}
              onClick={() => {
                setDialog(null);
                browse(-1);
              }}
            >
              ‹ {t('reader.historyPrev')}
            </button>
            <button
              type="button"
              class="chip"
              disabled={!history.length}
              onClick={() => {
                setDialog(null);
                browse(1);
              }}
            >
              {t('reader.historyNext')} ›
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Items past `shown` stay in the row, invisible but measurable (see `useFitCount`). */
function fitClass(base: string, index: number, shown: number): string {
  return index < shown ? base : base + ' fit-hidden';
}
