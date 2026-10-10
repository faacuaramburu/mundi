import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'work/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    files: ['scripts/geography.ts', 'scripts/prepare-geography.ts', 'src/client/globe.ts', 'tests/geography.test.ts'],
    // Numeric indexing into typed coordinates and matrices is not object-key injection.
    rules: { 'security/detect-object-injection': 'off' },
  },
  {
    files: ['scripts/prepare-geography.ts', 'src/server/geography.ts'],
    // Every filesystem URL is a fixed repository path, never supplied by users.
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    files: ['scripts/check-client-build.mjs'],
    // All directories are fixed; asset names must match a safe filename pattern.
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' },
    },
  },
);
