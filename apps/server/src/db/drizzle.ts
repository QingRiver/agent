import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { appDb } from './sqlite'

export const db = drizzle(appDb(), { schema })
