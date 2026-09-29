import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'public/catalog'] },
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
  prettier,
);
