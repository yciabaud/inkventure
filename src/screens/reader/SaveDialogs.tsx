import { useState } from 'preact/hooks';
import { formatRelativeDate, t } from '../../i18n/i18n';
import type { SlotInfo } from '../../storage/saves';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';

function slotDetails(info: SlotInfo): string {
  return t('saves.details', {
    name: info.name || t('saves.defaultName', { turn: info.turn }),
    turn: info.turn,
    date: formatRelativeDate(new Date(info.date)),
  });
}

/** One full-width slot button: "Slot 2" over its details, or "Empty". */
function SlotButton({
  info,
  slot,
  disabled,
  onChoose,
}: {
  info: SlotInfo | null;
  slot: number;
  disabled?: boolean;
  onChoose: () => void;
}) {
  return (
    <button type="button" class="menu__item saves__slot" disabled={disabled} onClick={onChoose}>
      <span class="saves__slot-title">{t('saves.slot', { slot: slot })}</span>
      <span class="saves__slot-details">{info ? slotDetails(info) : t('saves.empty')}</span>
    </button>
  );
}

/** A message under the slots: the outcome of the last save or restore. */
export type SaveMessage = { kind: 'done' | 'error'; text: string } | null;

/** Save… (SPEC §3.6): a name, then the slot to write it in. The dialog stays open to show the outcome. */
export function SaveDialog({
  slots,
  defaultName,
  message,
  onSave,
  onClose,
}: {
  slots: Array<SlotInfo | null>;
  defaultName: string;
  message: SaveMessage;
  onSave: (slot: number, name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <Dialog title={t('saves.saveTitle')} onClose={onClose}>
      <div class="saves ui-font">
        <label class="saves__label">
          {t('saves.name')}
          <input
            type="text"
            class="saves__field"
            value={name}
            maxLength={40}
            onInput={(event) => setName((event.target as HTMLInputElement).value)}
          />
        </label>
        <p class="saves__hint">{t('saves.saveHint')}</p>
      </div>
      <ul class="menu">
        {slots.map((info, i) => (
          <li key={i}>
            <SlotButton info={info} slot={i + 1} onChoose={() => onSave(i + 1, name.trim())} />
          </li>
        ))}
      </ul>
      {message && (
        <p
          class={
            'saves__message ui-font' + (message.kind === 'error' ? ' saves__message--error' : '')
          }
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
    </Dialog>
  );
}

/** Restore…: the saved slots (empty ones cannot be chosen). */
export function RestoreDialog({
  slots,
  message,
  onRestore,
  onClose,
}: {
  slots: Array<SlotInfo | null>;
  message: SaveMessage;
  onRestore: (slot: number) => void;
  onClose: () => void;
}) {
  let any = false;
  for (let i = 0; i < slots.length; i++) if (slots[i]) any = true;
  return (
    <Dialog title={t('saves.restoreTitle')} onClose={onClose}>
      {any ? (
        <ul class="menu">
          {slots.map((info, i) => (
            <li key={i}>
              <SlotButton
                info={info}
                slot={i + 1}
                disabled={!info}
                onChoose={() => onRestore(i + 1)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p class="saves__hint saves ui-font">{t('saves.none')}</p>
      )}
      {message && (
        <p class="saves__message saves__message--error ui-font" role="alert">
          {message.text}
        </p>
      )}
    </Dialog>
  );
}

/** Restart asks first: the current game is lost unless saved. */
export function RestartDialog({
  onConfirm,
  onErase,
  onClose,
  text,
}: {
  onConfirm: () => void;
  /** Also offers to erase the story's own saves and start afresh (Twine). */
  onErase?: () => void;
  onClose: () => void;
  /** What restarting does, when it is not the usual (a Decker deck loses where the player was). */
  text?: string;
}) {
  return (
    <Dialog title={t('saves.restartTitle')} onClose={onClose}>
      <div class="saves ui-font">
        <p class="saves__hint">
          {text || t(onErase ? 'saves.restartTextErase' : 'saves.restartText')}
        </p>
        <div class="saves__buttons">
          <Button onClick={onConfirm}>{t('saves.restartConfirm')}</Button>
          {onErase && <Button onClick={onErase}>{t('saves.restartErase')}</Button>}
          <Button variant="secondary" onClick={onClose}>
            {t('saves.cancel')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
