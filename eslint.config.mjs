import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['packages/**/*.mts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['packages/**/*.test.mts'],
    // The node:test runner owns registration promises; all other promises remain checked.
    rules: {
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [{ from: 'package', name: 'test', package: '@types/node' }],
      }],
    },
  },
  {
    files: ['packages/**/*.mjs', 'eslint.config.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        process: 'readonly', console: 'readonly', URL: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
      },
    },
  },
);
