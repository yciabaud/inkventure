// Why a story file could not be had (story S3.4). Apart from storyFile.ts, which pulls in the unzip library, so the
// play screen can name failures without loading it.

/** `status` is the HTTP status of an `http` failure. */
export interface StoryFileError extends Error {
  name: 'StoryFileError';
  reason: 'network' | 'http' | 'timeout' | 'format';
  status?: number;
}

// A plain Error rather than a subclass: extending built-ins pulls heavy helpers into the legacy bundle.
export function storyFileError(
  reason: StoryFileError['reason'],
  message: string,
  status?: number,
): StoryFileError {
  const error = new Error(message) as StoryFileError;
  error.name = 'StoryFileError';
  error.reason = reason;
  if (status !== undefined) error.status = status;
  return error;
}

export function isStoryFileError(error: unknown): error is StoryFileError {
  return error instanceof Error && error.name === 'StoryFileError';
}
