// Flat ESLint config (ESLint 9) for the admin app ONLY.
//
// Scope: this config lives in the app package and lints `src/**` of THIS package. It is intentionally
// NOT a repo-wide config — other workspace packages (admin-*, crud, element-plus, etc.) are out of
// scope so this track does not flood unrelated subprojects with lint errors. Run via the package's
// `lint` / `lint:fix` scripts (which point eslint at this dir), or by lint-staged on staged files.
//
// Stack: vue3 (SFC + JSX/TSX render fns) + TypeScript, with eslint-config-prettier last so ESLint
// never fights Prettier over formatting (formatting is Prettier's job; ESLint catches real problems).
// Rules are pragmatic on purpose: the existing app uses `any` heavily in crud option factories, so
// hard "no-any"/"strict-unused" rules would be noise, not signal — they're relaxed to warnings.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // Only lint THIS app's source. Everything else (build output, deps, generated stats) is ignored so
  // `lint` stays fast and never touches sibling packages.
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'stats.html',
      '*.config.js',
      '*.config.ts',
      '*.config.mjs',
      'vite.config.ts',
      'vitest.config.mjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],

  // TS / TSX (render-function components live in .tsx).
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // Vue SFCs — parse <script> blocks with the TS parser.
  {
    files: ['src/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        ecmaFeatures: { jsx: true },
      },
    },
  },

  // Shared rule tuning across all linted files.
  {
    files: ['src/**/*.{ts,tsx,vue}'],
    languageOptions: {
      globals: {
        // Browser app globals (console, window, document, timers, …) + node-ish build globals.
        console: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      // The app's crud option factories are deliberately loosely typed (vendor crud passes `any`-ish
      // shapes). Catching real `any` misuse here would mean a wall of false positives — keep it off,
      // matching the reference admin project.
      '@typescript-eslint/no-explicit-any': 'off',
      // Surface dead bindings but don't block on them; ignore intentional `_`-prefixed / leading args.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', args: 'after-used', ignoreRestSiblings: true },
      ],
      'no-unused-vars': 'off', // handled by the TS-aware rule above
      // Pragmatic escapes the codebase relies on.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Keep prefer-const, but allow the valid "declare `let` undefined, assign once after closures
      // capture it" pattern (e.g. chassis/stores.ts sessionStoreRef) — that genuinely needs `let`.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      // Allow console.warn/console.error (real diagnostics) but flag stray console.log.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Vue: this app uses kebab-less multi-word view names (Login, Layout) and inline render fns.
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off', // richtext demo intentionally renders HTML
      'vue/require-default-prop': 'off',
    },
  },

  // Keep ESLint out of Prettier's lane — MUST be last so it can turn off conflicting style rules.
  prettier,
)
