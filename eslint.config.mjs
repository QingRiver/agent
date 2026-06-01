import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: true,
  formatters: true,
  vue: false,
  ignores: [
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/routeTree.gen.ts',
  ],
  rules: {
    'no-console': 'off',
    'ts/no-redeclare': 'off',
  },
}, {
  files: ['apps/client/src/routes/**/*.{tsx,ts}'],
  rules: {
    'react-refresh/only-export-components': 'off',
  },
})
