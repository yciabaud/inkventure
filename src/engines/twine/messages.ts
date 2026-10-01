// Messages between the reader and a Twine story's frame (frameScript.ts). Kept apart from the frame script, so the
// reader's initial bundle does not carry it.

/** `source` of every message between the reader and the frame. */
export const FRAME_MESSAGE = 'inkventure-twine';

/** Id of the injected e-ink `<style>` element. */
export const STYLE_ID = 'inkventure-eink';

/** Messages from the frame. */
export type FrameMessage =
  | { source: typeof FRAME_MESSAGE; type: 'storage'; area: 'local' | 'session'; items: unknown }
  | { source: typeof FRAME_MESSAGE; type: 'page'; page: number; pages: number }
  /** A relative reference the story made after it loaded (story S1.11): answered when it names a kept file. */
  | { source: typeof FRAME_MESSAGE; type: 'asset'; ref: string };

/** The saved storage the frame starts with. */
export interface FrameStorage {
  local: Record<string, string>;
  session: Record<string, string>;
}
