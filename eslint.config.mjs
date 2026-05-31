import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: true,
  formatters: true,
  vue: false,
  ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  rules: {
    'no-console': 'off',
    'ts/no-redeclare': 'off',
  },
})
