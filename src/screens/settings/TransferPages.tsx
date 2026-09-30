// Export / import of the player's data as a text code (SPEC §6.3; story S5.2): two pages of Settings › Data.
// The codec is loaded lazily, with the deflate library.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { navigate } from '../../app/router';
import { formatDate, t, type MessageKey } from '../../i18n/i18n';
import { initLocale } from '../../i18n/locale';
import { getStore, isStorageFullError } from '../../storage';
import type { Backup, Contents, DecodeError, ImportMode } from '../../storage/transfer';
import { Button } from '../../ui/Button';
import { SectionPage } from './SectionPage';

type TransferModule = typeof import('../../storage/transfer');

function loadTransfer(): Promise<TransferModule> {
  return import('../../storage/transfer');
}

/** Export and Import are pages of Data: their "‹" goes back there. */
function Page({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <SectionPage title={title} parent={{ section: 'data', label: t('settings.data') }}>
      {children}
    </SectionPage>
  );
}

type Message = { kind: 'done' | 'error'; text: string } | null;

function MessageLine({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p
      class={'transfer__message' + (message.kind === 'error' ? ' transfer__message--error' : '')}
      role={message.kind === 'error' ? 'alert' : 'status'}
    >
      {message.text}
    </p>
  );
}

/** Downloads work where `a[download]` and object URLs exist (not on every e-reader). */
function canDownload(): boolean {
  return (
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    'download' in document.createElement('a')
  );
}

function fileName(date: Date): string {
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  return (
    'inkventure-' +
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    '.txt'
  );
}

function download(code: string) {
  const url = URL.createObjectURL(new Blob([code + '\n'], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(new Date());
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copies through the text area: the Clipboard API where allowed, else the older `copy` command. */
function copy(area: HTMLTextAreaElement): Promise<boolean> {
  function fallback(): boolean {
    area.focus();
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    return clipboard.writeText(area.value).then(() => true, fallback);
  }
  return Promise.resolve(fallback());
}

export function ExportPage() {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    loadTransfer().then(
      (transfer) => {
        if (live) setCode(transfer.encodeBackup(transfer.collectBackup(getStore(), Date.now())));
      },
      () => live && setMessage({ kind: 'error', text: t('transfer.loadFailed') }),
    );
    return () => {
      live = false;
    };
  }, []);

  function onCopy() {
    if (!area.current) return;
    copy(area.current).then((done) =>
      setMessage(
        done
          ? { kind: 'done', text: t('transfer.copied') }
          : { kind: 'error', text: t('transfer.copyFailed') },
      ),
    );
  }

  return (
    <Page title={t('transfer.exportTitle')}>
      <div class="transfer">
        <p class="settings-page__hint">{t('transfer.exportHint')}</p>
        <textarea
          ref={area}
          class="transfer__code"
          readOnly
          aria-label={t('transfer.code')}
          value={code === null ? t('transfer.preparing') : code}
        />
        {code !== null && (
          <p class="settings-page__hint">
            {t('transfer.codeLength', { count: code.replace(/\s+/g, '').length })}
          </p>
        )}
        <div class="saves__buttons">
          <Button onClick={code === null ? undefined : onCopy}>{t('transfer.copy')}</Button>
          {canDownload() && (
            <Button variant="secondary" onClick={code === null ? undefined : () => download(code)}>
              {t('transfer.download')}
            </Button>
          )}
        </div>
        <MessageLine message={message} />
      </div>
    </Page>
  );
}

const DECODE_ERRORS: Record<DecodeError, MessageKey> = {
  empty: 'transfer.errorEmpty',
  format: 'transfer.errorFormat',
  checksum: 'transfer.errorChecksum',
  newer: 'transfer.errorNewer',
};

function contentsLines(contents: Contents): string[] {
  const lines: string[] = [];
  if (contents.adventures) lines.push(t('transfer.adventures', { count: contents.adventures }));
  if (contents.saves) lines.push(t('transfer.saves', { count: contents.saves }));
  if (contents.autosaves) lines.push(t('transfer.autosaves', { count: contents.autosaves }));
  if (contents.settings) lines.push(t('transfer.settings'));
  if (!lines.length) lines.push(t('transfer.nothing'));
  return lines;
}

interface Checked {
  transfer: TransferModule;
  backup: Backup;
  /** Named saves of this device each mode would replace. */
  replaced: Record<ImportMode, number>;
}

export function ImportPage() {
  const [text, setText] = useState('');
  const [checked, setChecked] = useState<Checked | null>(null);
  const [message, setMessage] = useState<Message>(null);

  function check(value: string) {
    setMessage(null);
    loadTransfer().then(
      (transfer) => {
        const result = transfer.decodeBackup(value);
        if (!result.ok) {
          setMessage({ kind: 'error', text: t(DECODE_ERRORS[result.error]) });
          return;
        }
        const local = transfer.localEntries(getStore());
        setChecked({
          transfer: transfer,
          backup: result.backup,
          replaced: {
            merge: transfer.planImport(local, result.backup.entries, 'merge').replacedSaves,
            overwrite: transfer.planImport(local, result.backup.entries, 'overwrite').replacedSaves,
          },
        });
      },
      () => setMessage({ kind: 'error', text: t('transfer.loadFailed') }),
    );
  }

  function openFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      setText(value);
      check(value);
    };
    reader.onerror = () => setMessage({ kind: 'error', text: t('transfer.fileFailed') });
    reader.readAsText(file);
    input.value = '';
  }

  function apply(mode: ImportMode) {
    if (!checked) return;
    const store = getStore();
    try {
      checked.transfer.applyImport(store, checked.backup, mode);
    } catch (error) {
      setMessage({
        kind: 'error',
        text: t(isStorageFullError(error) ? 'transfer.full' : 'transfer.failed'),
      });
      return;
    }
    // The code may bring another language; then Home, where Continue picks up the imported game.
    initLocale(store);
    navigate({ name: 'home' });
  }

  if (checked) {
    return (
      <Page title={t('transfer.importTitle')}>
        <div class="transfer">
          <p class="settings-page__usage">
            {t('transfer.codeFrom', { date: formatDate(new Date(checked.backup.date)) })}
          </p>
          <ul class="settings-page__list transfer__contents">
            {contentsLines(checked.transfer.contentsOf(checked.backup.entries)).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Choice
            label={t('transfer.merge')}
            hint={t('transfer.mergeHint')}
            warning={
              checked.replaced.merge
                ? t('transfer.mergeReplaces', { count: checked.replaced.merge })
                : ''
            }
            onChoose={() => apply('merge')}
          />
          <Choice
            label={t('transfer.overwrite')}
            hint={t('transfer.overwriteHint')}
            warning={
              checked.replaced.overwrite
                ? t('transfer.overwriteLoses', { count: checked.replaced.overwrite })
                : ''
            }
            variant="secondary"
            onChoose={() => apply('overwrite')}
          />
          <div class="saves__buttons">
            <Button
              variant="secondary"
              onClick={() => {
                setChecked(null);
                setMessage(null);
              }}
            >
              {t('saves.cancel')}
            </Button>
          </div>
          <MessageLine message={message} />
        </div>
      </Page>
    );
  }

  return (
    <Page title={t('transfer.importTitle')}>
      <div class="transfer">
        <p class="settings-page__hint">{t('transfer.importHint')}</p>
        <textarea
          class="transfer__code"
          aria-label={t('transfer.code')}
          placeholder={t('transfer.paste')}
          value={text}
          onInput={(event) => setText((event.target as HTMLTextAreaElement).value)}
        />
        <div class="saves__buttons">
          <Button onClick={() => check(text)}>{t('transfer.check')}</Button>
          {typeof FileReader !== 'undefined' && (
            <label class="btn btn--secondary transfer__file">
              {t('transfer.openFile')}
              <input type="file" accept=".txt,text/plain" onChange={openFile} />
            </label>
          )}
        </div>
        <MessageLine message={message} />
      </div>
    </Page>
  );
}

function Choice({
  label,
  hint,
  warning,
  variant = 'primary',
  onChoose,
}: {
  label: string;
  hint: string;
  warning: string;
  variant?: 'primary' | 'secondary';
  onChoose: () => void;
}) {
  return (
    <div class="transfer__choice">
      <Button variant={variant} onClick={onChoose}>
        {label}
      </Button>
      <p class="settings-page__hint">
        {hint}
        {warning && <strong> {warning}</strong>}
      </p>
    </div>
  );
}
