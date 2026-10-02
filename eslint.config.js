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
        { object: 'document', property: 'cookie', message: 'Spec §7.15: cookies are never read.' },
        { object: 'chrome', property: 'cookies', message: 'Spec §7.3/§7.15: no cookies permission, no cookie access.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Spec §7.2: build DOM nodes instead.',
        },
        {
          // §7.9: the page's globals belong to YouTube. Assigning to one is how
          // fetch/XHR patching starts, whatever the property.
          selector: "AssignmentExpression > MemberExpression.left[object.name=/^(window|globalThis|self)$/]",
          message: "Spec §7.9: never write to the page's globals.",
        },
        {
          selector: "AssignmentExpression > MemberExpression.left > MemberExpression.object[property.name='prototype']",
          message: 'Spec §7.9: no prototype patching.',
        },
        {
          selector: "CallExpression[callee.object.name=/^(Object|Reflect)$/][callee.property.name=/^(defineProperty|defineProperties|setPrototypeOf|set)$/]",
          message: 'Spec §7.9: no property redefinition — it is monkey-patching by another name.',
        },
        {
          // ADR-0002 measured the signature as unnecessary; neither the cookie
          // name nor an auth header has a reason to appear in source.
          selector: 'Literal[value=/SAPISID/i], TemplateElement[value.raw=/SAPISID/i]',
          message: 'Spec §7.15: no signature computation.',
        },
        {
          selector: 'Property[key.name=/^authorization$/i], Property[key.value=/^authorization$/i]',
          message: 'Spec §7.15: requests carry no Authorization header.',
        },
      ],
      // Unlike a selector on `eval(...)`, these also catch window.eval,
      // (0, eval)(...) and Function(...) without `new`.
      'no-eval': 'error',
      'no-new-func': 'error',
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
