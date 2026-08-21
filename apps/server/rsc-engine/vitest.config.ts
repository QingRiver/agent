import { defineConfig } from 'vitest/config'

/** 不走仓库根 globalSetup（无需 Postgres） */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
