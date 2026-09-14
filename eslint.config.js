import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * The restricted-syntax rules below are not style preferences. They are
 * §7 of the spec expressed as code so a review cannot forget them.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'dist-zip/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly', __DEV__: 'readonly' },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Spec §7.2: build DOM nodes or use textContent.' },
        { property: 'outerHTML', message: 'Spec §7.2: build DOM nodes or use textContent.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Spec §7.2: build DOM nodes instead.',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'Spec §7.1: no dynamic code execution.',
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'Spec §7.1: no dynamic code execution.',
        },
      ],
      'no-implied-eval': 'error',
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['build.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Pasted into the browser console by hand, not shipped in the package.
    files: ['docs/spike/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
);
