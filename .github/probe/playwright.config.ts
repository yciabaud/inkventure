// TEMPORARY (S1.11): runs the probe of the real Jeangille zip through the app, in CI. Removed before merge.
import base from '../../playwright.config';

export default {
  ...base,
  testDir: '.',
  reporter: 'list',
  projects: (base.projects || []).filter((p) =>
    ['desktop', 'ereader-small-chromium', 'ereader-small-webkit'].includes(p.name as string),
  ),
};
