import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import legacy from '@vitejs/plugin-legacy';
import { buildInfoPlugin } from './scripts/build/build-info.ts';
import { bitsyProbePlugin } from './scripts/build/bitsy-probe.ts';
import { daadProbePlugin } from './scripts/build/daad-probe.ts';
import { deckerProbePlugin } from './scripts/build/decker-probe.ts';
import { deckerRuntimePlugin } from './scripts/build/decker-runtime.ts';
import { ebookPagePlugin } from './scripts/build/ebook-page.ts';
import { licencesPlugin } from './scripts/build/licences.ts';
import { serviceWorkerPlugin } from './scripts/build/service-worker.ts';
import { vendorPatchesPlugin } from './scripts/build/vendor-patches.ts';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (GitHub Pages project site: /inkventure/).
  base: './',
  build: {
    // Read by scripts/size/check-size.ts to tell initial chunks from lazy ones.
    manifest: true,
    // Bundled packages' licences (.vite/license.md), completed into dist/licences.txt by licencesPlugin.
    license: true,
  },
  plugins: [
    preact(),
    vendorPatchesPlugin(),
    buildInfoPlugin(),
    // The ebook download page (S6.3), dist/ebook/: not an entry, outside the app's budgets.
    ebookPagePlugin(),
    // Third-party licences in full, dist/licences.txt (S7.2).
    licencesPlugin(),
    // The offline app shell (S5.3), dist/sw.js: its precache list comes from the manifest.
    serviceWorkerPlugin(),
    // The Decker probe (S0.11), dist/probe/decker/: Decker's runtime patched for e-ink, outside the app's budgets.
    deckerProbePlugin(),
    // The Decker reader's runtime (S1.29): `virtual:decker-runtime`, two scripts built as assets.
    deckerRuntimePlugin(),
    // The Bitsy probe (S0.12), dist/probe/bitsy/: Bitsy's engine with an e-ink system layer, outside the app's budgets.
    bitsyProbePlugin(),
    // The DAAD probe (S0.13), dist/probe/daad/: jDAAD patched for e-ink and transpiled to ES2017, outside the app's budgets.
    daadProbePlugin(),
    // ES5 bundle + core-js polyfills for the Kindle experimental browser (old WebKit).
    legacy({
      targets: ['defaults', 'safari >= 5', 'ie >= 11'],
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Run the engine packages through Vite so the vendor patches apply in tests too.
    server: { deps: { inline: ['glkote-term', 'ifvms'] } },
  },
});
