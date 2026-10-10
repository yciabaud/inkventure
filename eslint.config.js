import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'public/catalog',
      'public/probe/qrcode.js',
      'vendor',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // All persistence goes through src/storage/.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/storage/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Use src/storage/ instead.' },
        { name: 'sessionStorage', message: 'Use src/storage/ instead.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'Use src/storage/ instead.' },
        { object: 'window', property: 'sessionStorage', message: 'Use src/storage/ instead.' },
      ],
    },
  },
  {
    // Device probe (S0.3): standalone ES5 script for old e-reader browsers, no build step.
    files: ['public/probe/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: { ...globals.browser, qrcode: 'readonly' },
    },
    rules: {
      // ES5 has no optional catch binding, so `catch (e)` is required even when `e` is unused.
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
  {
    // The Bitsy probe's e-ink system layer (S0.12): plain ES5 scripts around Bitsy's engine, whose globals they use.
    files: ['scripts/build/bitsy-eink/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      // Bitsy's system.js calls the functions defined here for it.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(InputSystem|SoundSystem|enableGlobalAudioContext)$',
        },
      ],
      'no-unused-vars': 'off',
    },
  },
  {
    // The app's Service Worker template (S5.3): plain ES5, copied into dist/sw.js by the build.
    files: ['src/sw/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      // Promise is ES2015 but every browser with a Service Worker has it.
      globals: { ...globals.serviceworker, Promise: 'readonly' },
    },
  },
  prettier,
);
