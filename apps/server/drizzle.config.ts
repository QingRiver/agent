import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

/**
 * generate/push 仅需 dialect + schema；dbCredentials.url 在 generate 阶段不连库，
 * push/studio 时若未设 DATABASE_URL 则用 infra/postgres 默认本地连接串兜底。
 */
export default defineConfig({
  schema: './src/db/schema',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/agent',
  },
})
