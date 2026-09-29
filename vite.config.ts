import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (GitHub Pages, S0.2).
  base: './',
  build: {
    // Read by scripts/size/check-size.ts to tell initial chunks from lazy ones.
    manifest: true,
  },
  plugins: [
    preact(),
    // ES5 bundle + core-js polyfills for the Kindle experimental browser (old WebKit).
    legacy({
      targets: ['defaults', 'safari >= 5', 'ie >= 11'],
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
  },
});
