import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: true,
  formatters: true,
  vue: false,
  ignores: [
    '**/*.md',
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/routeTree.gen.ts',
    '**/wiki/**',
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
}, {
  // dotenv 必须在 router/graph 加载前执行，不可被 import 排序挪到文件末尾
  files: ['apps/server/src/index.ts'],
  rules: {
    'perfectionist/sort-imports': 'off',
  },
})
