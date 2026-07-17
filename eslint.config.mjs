import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: true,
  vue: false,
  formatters: {
    typescript: {
      formatter: 'prettier',
      options: {
        printWidth: 40,
      }
    },
    javascript: {
      formatter: 'prettier',
      options: {
        printWidth: 40,
      }
    },
  },
  ignores: [
    '**/*.md',
    '**/drizzle/**',
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/routeTree.gen.ts',
    '**/wiki/**',
  ],
  rules: {
    'no-console': 'off',
    'ts/no-redeclare': 'off',
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ImportDeclaration[source.value=/\\.js$/]',
        message: 'Import paths must not include a .js extension.',
      },
      {
        selector: 'ExportNamedDeclaration[source.value=/\\.js$/]',
        message: 'Re-export paths must not include a .js extension.',
      },
      {
        selector: 'ExportAllDeclaration[source.value=/\\.js$/]',
        message: 'Re-export paths must not include a .js extension.',
      },
    ],
  },
}, {
  files: ['apps/client/src/routes/**/*.{tsx,ts}', 'apps/client/src/contexts/**/*.{tsx,ts}'],
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
