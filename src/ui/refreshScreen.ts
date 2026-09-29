// Clears e-ink ghosting by painting the whole screen black then white before restoring the page.
// Plain timeouts, no CSS animation (the Kindle browser has none we can rely on).

export const REFRESH_STEP_MS = 150;

export function refreshScreen(done?: () => void): void {
  const flash = document.createElement('div');
  flash.className = 'screen-flash screen-flash--black';
  flash.setAttribute('aria-hidden', 'true');
  document.body.appendChild(flash);
  window.setTimeout(() => {
    flash.className = 'screen-flash screen-flash--white';
    window.setTimeout(() => {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
      if (done) done();
    }, REFRESH_STEP_MS);
  }, REFRESH_STEP_MS);
}
