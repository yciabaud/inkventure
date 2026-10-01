// Single-key prompts (SPEC §3.6): chips for the keys the game names, "Continue" and a one-key field, for e-readers
// that have no physical keyboard.
import { t } from '../../i18n/i18n';
import type { KeyChip, KeyPrompt } from '../../reader/keys';

interface Props {
  prompt: KeyPrompt;
  /** Sends a key: a character, or a Glk key name (`return`). */
  onKey: (key: string) => void;
  /** The one-key field got or lost focus (the reader stays on the last page while it has it). */
  onFocusChange: (focused: boolean) => void;
}

/** The key as shown on its chip: named keys follow the UI language. */
function keyName(chip: KeyChip): string {
  if (chip.send === 'return') return t('reader.key.return');
  if (chip.send === 'escape') return t('reader.key.escape');
  return chip.key;
}

export function KeyBar({ prompt, onKey, onFocusChange }: Props) {
  function send(key: string) {
    onFocusChange(false);
    onKey(key);
  }

  return (
    <div class="key-bar ui-font">
      {prompt.keys.length > 0 && (
        <div class="key-bar__keys" role="group" aria-label={t('reader.key.keys')}>
          {prompt.keys.map((chip) => (
            <button
              key={chip.send}
              type="button"
              class="chip key-bar__chip"
              aria-label={chip.label ? keyName(chip) + ' — ' + chip.label : keyName(chip)}
              onClick={() => send(chip.send)}
            >
              {keyName(chip)}
              {chip.label && <span class="key-bar__label"> — {chip.label}</span>}
            </button>
          ))}
        </div>
      )}
      <div class="key-bar__row">
        <button
          type="button"
          class="reader__present"
          onClick={() => send(prompt.space ? ' ' : 'return')}
        >
          {t('reader.continue')} ›
        </button>
        <input
          class="key-bar__field"
          type="text"
          value=""
          maxLength={1}
          placeholder={t('reader.key.field')}
          aria-label={t('reader.key.fieldLabel')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellcheck={false}
          onInput={(event) => {
            const input = event.target as HTMLInputElement;
            const typed = input.value.charAt(0);
            input.value = '';
            if (typed) send(/[A-Za-z]/.test(typed) ? typed.toLowerCase() : typed);
          }}
          onKeyDown={(event) => {
            // Return in the empty field is the key Return (the global key handler skips text fields).
            if (event.key === 'Enter') {
              event.preventDefault();
              send('return');
            }
          }}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
        />
      </div>
    </div>
  );
}
