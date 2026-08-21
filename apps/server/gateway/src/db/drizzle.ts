import { drizzle } from 'drizzle-orm/node-postgres'
import { pool } from './client'
import * as schema from './schema'

export const db = drizzle(pool, { schema })
