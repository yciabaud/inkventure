// Deterministic typographic cover for games without cover art (like Kindle's placeholder covers).

export type CoverVariant = 'frame' | 'band' | 'inverse' | 'rules' | 'corner';

export const COVER_VARIANTS: CoverVariant[] = ['frame', 'band', 'inverse', 'rules', 'corner'];

export const COVER_ORNAMENTS = ['❦', '✦', '◆', '❧', '✧', '●'];

export interface CoverDesign {
  variant: CoverVariant;
  ornament: string;
  title: string;
  author: string;
}

/** 32-bit FNV-1a hash: stable across browsers and sessions. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    // hash * 16777619 without Math.imul (ES2015): shifts keep it exact in 32 bits.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash >>> 0;
}

function normalise(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Longest author line a cover shows in full. */
export const MAX_COVER_AUTHOR = 32;

/** A long list of authors keeps its first name only: `Tim Anderson, Marc Blank, …` → `Tim Anderson…`. */
export function shortAuthor(author: string): string {
  if (author.length <= MAX_COVER_AUTHOR) return author;
  const first = author.split(/,|;| and | & | \[| \(/)[0].trim();
  return (
    (first.length <= MAX_COVER_AUTHOR ? first : first.slice(0, MAX_COVER_AUTHOR - 1).trim()) + '…'
  );
}

export function coverDesign(title: string, author: string): CoverDesign {
  const cleanTitle = normalise(title);
  const cleanAuthor = normalise(author);
  const hash = hashString(cleanTitle.toLowerCase() + '\u0000' + cleanAuthor.toLowerCase());
  return {
    variant: COVER_VARIANTS[hash % COVER_VARIANTS.length],
    ornament: COVER_ORNAMENTS[Math.floor(hash / COVER_VARIANTS.length) % COVER_ORNAMENTS.length],
    title: cleanTitle,
    author: shortAuthor(cleanAuthor),
  };
}
