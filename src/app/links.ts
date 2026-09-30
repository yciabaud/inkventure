// Links out of the app.

/** Where problems are reported: the project's issue tracker. */
export const ISSUES_URL = 'https://github.com/yciabaud/inkventure/issues/new';

/** A new issue with `title` and `body` filled in. */
export function reportUrl(title: string, body: string): string {
  return ISSUES_URL + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
}
