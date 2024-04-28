module.exports = {
  extends: 'love',
  ignorePatterns: [".eslintrc*"]
  rules: {
    '@typescript-eslint/array-type': ['error', { default: 'array' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-extraneous-class': ['error', { allowEmpty: true }],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignoreConditionalTests: true, ignoreTernaryTests: true }],
    '@typescript-eslint/prefer-readonly': 'off',
    '@typescript-eslint/restrict-template-expressions': ['error', { allowAny: true }], // `${myVar}` is fine if myVar is `any`
    '@typescript-eslint/strict-boolean-expressions': 'off'
  }
}
