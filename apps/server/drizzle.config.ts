import path from 'node:path'
import { dataDirPath } from '@agent/env'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(dataDirPath, 'app.sqlite'),
  },
})
