import { useState } from 'preact/hooks';
import { t } from '../i18n/i18n';
import { coverDesign } from './cover';

// Titles longer than this use a smaller size so words are not broken.
const LONG_TITLE = 14;

interface Props {
  title: string;
  author: string;
  /** IFDB cover art URL; shown in grayscale. Falls back to the typographic cover when missing or broken. */
  imageUrl?: string;
  size?: 'small' | 'medium' | 'large';
}

export function Cover({ title, author, imageUrl, size = 'medium' }: Props) {
  const [broken, setBroken] = useState(false);
  const cls = 'cover cover--' + size;

  if (imageUrl && !broken) {
    return (
      <div class={cls}>
        <img class="cover__img" src={imageUrl} alt={title} onError={() => setBroken(true)} />
      </div>
    );
  }

  const design = coverDesign(title, author);
  return (
    <div class={cls + ' cover--typo cover--' + design.variant} role="img" aria-label={title}>
      <span
        class={'cover__title' + (design.title.length > LONG_TITLE ? ' cover__title--long' : '')}
      >
        {design.title}
      </span>
      <span class="cover__ornament" aria-hidden="true">
        {design.ornament}
      </span>
      <span class="cover__author">
        {design.author ? t('cover.by', { author: design.author }) : ''}
      </span>
    </div>
  );
}
