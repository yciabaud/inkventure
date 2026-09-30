// Choices of a choice game (SPEC §3.6): full-width numbered buttons under the text of the last page.
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n/i18n';

/** Button height and gap between buttons (`.story-choices` CSS). */
const BUTTON_HEIGHT = 48;
const GAP = 8;
/** Vertical padding and border of the raised slot around the list (`.reader__slot--raised`). */
const SLOT_PADDING = 17;
/** The list never takes more than this share of the screen height; past it, it scrolls (a last resort). */
const MAX_SHARE = 0.6;

/** Height of the slot for `count` one-line choices, before the list has been measured. */
export function choicesHeight(count: number): number {
  return Math.max(count, 1) * (BUTTON_HEIGHT + GAP) - GAP + SLOT_PADDING;
}

function capped(height: number): number {
  return Math.min(height, Math.max(choicesHeight(1), Math.floor(window.innerHeight * MAX_SHARE)));
}

interface Props {
  choices: string[];
  onChoose: (index: number) => void;
  /** Height the slot needs for the list as laid out (long choices wrap), measured after each render and on resize. */
  onHeight: (height: number) => void;
}

export function ChoiceList({ choices, onChoose, onHeight }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const onHeightRef = useRef(onHeight);
  useEffect(() => {
    onHeightRef.current = onHeight;
  });

  function measure() {
    const list = listRef.current;
    if (list) onHeightRef.current(capped(list.scrollHeight + SLOT_PADDING));
  }

  useLayoutEffect(measure);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <ol class="story-choices" ref={listRef} aria-label={t('reader.choices')}>
      {choices.map((choice, index) => (
        <li class="story-choices__item" key={index + ':' + choice}>
          <button type="button" class="story-choice" onClick={() => onChoose(index)}>
            <span class="story-choice__number" aria-hidden="true">
              {index + 1}
            </span>
            <span class="story-choice__text">{choice}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
