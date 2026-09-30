import { t, type MessageKey } from '../../i18n/i18n';
import {
  ALIGNS,
  FONT_SIZES,
  MARGINS,
  SPACINGS,
  stepSize,
  TYPEFACES,
  type ReaderSettings,
} from '../../reader/settings';
import { Dialog } from '../../ui/Dialog';
import type { ReaderSettingsState } from './useReaderSettings';

interface ChoiceProps<T extends string> {
  label: string;
  values: T[];
  current: T;
  labelOf: (value: T) => string;
  onChoose: (value: T) => void;
}

/** A row of mutually exclusive buttons (aria-pressed on the current one). */
function Choice<T extends string>({ label, values, current, labelOf, onChoose }: ChoiceProps<T>) {
  return (
    <div class="settings__row">
      <p class="settings__label">{label}</p>
      <div class="segmented" role="group" aria-label={label}>
        {values.map((value) => (
          <button
            key={value}
            type="button"
            class="segmented__option"
            aria-pressed={value === current}
            onClick={() => onChoose(value)}
          >
            {labelOf(value)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The "Aa" panel (SPEC §3.6): every change applies (and re-paginates) at once and is saved. */
export function TextSettings({
  state,
  onClose,
}: {
  state: ReaderSettingsState;
  onClose: () => void;
}) {
  const s = state.settings;
  const set = (patch: Partial<ReaderSettings>) => state.update({ ...s, ...patch });
  const key = (name: string) => t(name as MessageKey);

  return (
    <Dialog title={t('reader.textSettings')} onClose={onClose}>
      <div class="settings ui-font">
        <div class="settings__row">
          <p class="settings__label">{t('reader.fontSize')}</p>
          <div class="segmented">
            <button
              type="button"
              class="segmented__option"
              aria-label={t('reader.smaller')}
              disabled={s.size === 0}
              onClick={() => state.update(stepSize(s, -1))}
            >
              A−
            </button>
            <span class="segmented__value" aria-live="polite">
              {t('reader.sizeStep', { step: s.size + 1, count: FONT_SIZES.length })}
            </span>
            <button
              type="button"
              class="segmented__option"
              aria-label={t('reader.larger')}
              disabled={s.size === FONT_SIZES.length - 1}
              onClick={() => state.update(stepSize(s, 1))}
            >
              A+
            </button>
          </div>
        </div>
        <Choice
          label={t('reader.typeface')}
          values={TYPEFACES}
          current={s.typeface}
          labelOf={(v) => key('reader.typeface.' + v)}
          onChoose={(v) => set({ typeface: v })}
        />
        <Choice
          label={t('reader.margins')}
          values={MARGINS}
          current={s.margins}
          labelOf={(v) => key('reader.margins.' + v)}
          onChoose={(v) => set({ margins: v })}
        />
        <Choice
          label={t('reader.spacing')}
          values={SPACINGS}
          current={s.spacing}
          labelOf={(v) => key('reader.spacing.' + v)}
          onChoose={(v) => set({ spacing: v })}
        />
        <Choice
          label={t('reader.align')}
          values={ALIGNS}
          current={s.align}
          labelOf={(v) => key('reader.align.' + v)}
          onChoose={(v) => set({ align: v })}
        />
        <label class="settings__check">
          <input
            type="checkbox"
            checked={state.perGame}
            onChange={(event) => state.setPerGame((event.target as HTMLInputElement).checked)}
          />
          <span>{t('reader.thisGameOnly')}</span>
        </label>
      </div>
    </Dialog>
  );
}
