import { formatHash } from '../../app/router';
import { t } from '../../i18n/i18n';
import { LinkButton } from '../../ui/Button';
import { Cover } from '../../ui/Cover';

// Placeholder: the real detail page (IFDB data, Add to Home) arrives in S3.3.
export function GameScreen({ tuid }: { tuid: string }) {
  const title = t('game.sampleTitle');
  return (
    <div class="screen">
      <h1 class="screen__title">{t('game.title')}</h1>
      <div class="game-summary">
        <Cover title={title + ' ' + tuid} author={t('game.sampleAuthor')} size="large" />
        <div class="game-summary__actions">
          <LinkButton block href={formatHash({ name: 'play', tuid })}>
            {t('game.play')}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
