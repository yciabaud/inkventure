// Offline support in the page (SPEC §6.2; story S5.3): registers the Service Worker (src/sw/sw.js) and says whether the
// device is online. Asking the worker to keep an engine is in catalog/offline.ts, loaded lazily.
import { useEffect, useState } from 'preact/hooks';

/** False when the browser knows it has no connection (the Kindle says so in airplane mode, S0.9). */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** `isOnline()`, redrawn when the connection comes or goes. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** The Service Worker API in a production build (the development server has no worker). */
export function container(): ServiceWorkerContainer | undefined {
  if (!import.meta.env.PROD || typeof navigator === 'undefined') return undefined;
  const sw = navigator.serviceWorker;
  return sw && typeof sw.register === 'function' ? sw : undefined;
}

/**
 * Registers the Service Worker, once the page is up (it takes a second on the Kindle the first time). A new build
 * takes over in the background; the page running then keeps its own files, and is reloaded at the next change of
 * screen so that it never asks for a file of the previous build, which the deployment removed.
 */
export function registerServiceWorker(): void {
  const sw = container();
  if (!sw) return;
  const hadController = !!sw.controller;
  let updated = false;
  sw.addEventListener('controllerchange', () => {
    if (hadController) updated = true;
  });
  window.addEventListener('hashchange', () => {
    if (updated) window.location.reload();
  });
  setTimeout(() => {
    sw.register('sw.js', { scope: './', updateViaCache: 'none' }).catch((error: Error) =>
      console.warn('Service Worker not registered: ' + error.message),
    );
  }, 0);
}
