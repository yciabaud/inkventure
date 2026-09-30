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
  /** Exact width in px (height 1.5 ×, type scaled to match), instead of a size class: grid covers. */
  width?: number;
}

export function Cover({ title, author, imageUrl, size = 'medium', width }: Props) {
  const [broken, setBroken] = useState(false);
  const cls = width ? 'cover' : 'cover cover--' + size;
  // Same proportions as the size classes (medium: 120 × 180 px, 14 px type).
  const style = width
    ? {
        width: width + 'px',
        height: Math.floor(width * 1.5) + 'px',
        fontSize: Math.round((width * 14) / 120) + 'px',
      }
    : undefined;

  if (imageUrl && !broken) {
    return (
      <div class={cls} style={style}>
        <img class="cover__img" src={imageUrl} alt={title} onError={() => setBroken(true)} />
      </div>
    );
  }

  const design = coverDesign(title, author);
  return (
    <div
      class={cls + ' cover--typo cover--' + design.variant}
      style={style}
      role="img"
      aria-label={title}
    >
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
