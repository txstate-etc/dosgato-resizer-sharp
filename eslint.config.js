import love from 'eslint-config-love'
import stylistic from '@stylistic/eslint-plugin'

const tsFiles = ['src/**/*.ts']

export default [
  // FORMATTING RULES
  {
    ...stylistic.configs.recommended,
    files: tsFiles
  },
  {
    files: tsFiles,
    rules: {
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/indent': ['error', 2, { ignoreComments: true }],
      '@stylistic/max-statements-per-line': ['error', { max: 3 }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/quote-props': ['error', 'as-needed'],
      '@stylistic/space-before-function-paren': ['error', 'always'],
      '@stylistic/type-annotation-spacing': 'error',
      '@stylistic/type-generic-spacing': 'error'
    }
  },
  // STRUCTURAL RULES
  {
    ...love,
    files: tsFiles
  },
  {
    files: tsFiles,
    rules: {
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/class-methods-use-this': 'off',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as' }], // disallow <string> casting, confusing vs generics
      '@typescript-eslint/explicit-function-return-type': 'off', // useless boilerplate
      '@typescript-eslint/init-declarations': 'off',
      '@typescript-eslint/max-params': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off', // generally not avoidable without wasting cpu cycles on a check
      '@typescript-eslint/no-unnecessary-condition': 'off', // too noisy with defensive coding and any-typed values
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off', // typescript already reports this and VSCode darkens the variable
      '@typescript-eslint/prefer-destructuring': 'off', // no reason to force destructuring
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignoreConditionalTests: true, ignorePrimitives: { bigint: false, boolean: false, number: false, string: true } }],
      '@typescript-eslint/prefer-readonly': 'off', // readonly adds a lot of complication and often infects other code with its complexity
      '@typescript-eslint/restrict-template-expressions': ['error', { allowAny: true }], // `${myVar}` is fine if myVar is `any`
      '@typescript-eslint/return-await': ['error', 'always'], // avoid accidentally breaking async stacktraces
      '@typescript-eslint/strict-boolean-expressions': 'off', // we know how truthiness works, annoying to have to avoid
      complexity: 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'max-depth': 'off',
      'max-lines': 'off',
      'new-cap': 'off',
      'no-await-in-loop': 'off',
      'no-console': 'off', // server-side logging is intentional
      'no-negated-condition': 'off',
      'no-param-reassign': 'off',
      'no-plusplus': 'off',
      'prefer-named-capture-group': 'off',
      'prefer-template': 'off',
      'preserve-caught-error': 'off',
      'promise/avoid-new': 'off',
      'require-atomic-updates': 'off',
      'require-unicode-regexp': 'off'
    }
  }
]
