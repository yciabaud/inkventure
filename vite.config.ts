import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import legacy from '@vitejs/plugin-legacy';
import { buildInfoPlugin } from './scripts/build/build-info.ts';
import { ebookPagePlugin } from './scripts/build/ebook-page.ts';
import { vendorPatchesPlugin } from './scripts/build/vendor-patches.ts';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (GitHub Pages project site: /inkventure/).
  base: './',
  build: {
    // Read by scripts/size/check-size.ts to tell initial chunks from lazy ones.
    manifest: true,
  },
  plugins: [
    preact(),
    vendorPatchesPlugin(),
    buildInfoPlugin(),
    // The ebook download page (S6.3), dist/ebook/: not an entry, outside the app's budgets.
    ebookPagePlugin(),
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
