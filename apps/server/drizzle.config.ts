import path from 'node:path'
import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? './data')

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(dataDir, 'app.sqlite'),
  },
})
