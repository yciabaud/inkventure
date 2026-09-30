// "How to play" (SPEC §3.3; story S4.1): a short guide for newcomers to interactive fiction, in pages like any text.
import { formatHash } from '../../app/router';
import { t, type MessageKey } from '../../i18n/i18n';
import { LinkButton } from '../../ui/Button';
import { PagedParagraphs } from '../../ui/PagedParagraphs';
import { FIXTURE_Z_TUID } from '../reader/ReaderScreen';

const PARAGRAPHS: MessageKey[] = [
  'help.p1',
  'help.p2',
  'help.p3',
  'help.p4',
  'help.p5',
  'help.p6',
  'help.p7',
];

export function HelpScreen() {
  return (
    <div class="screen help">
      <h1 class="screen__title">{t('help.title')}</h1>
      <PagedParagraphs paragraphs={PARAGRAPHS.map((key) => t(key))} />
      <div class="help__actions">
        <LinkButton href={formatHash({ name: 'library' })}>{t('home.browse')}</LinkButton>
        <LinkButton variant="secondary" href={formatHash({ name: 'play', tuid: FIXTURE_Z_TUID })}>
          {t('home.playFixture')}
        </LinkButton>
      </div>
    </div>
  );
}
