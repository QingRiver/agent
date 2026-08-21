import { env } from '@agent/env'
import { Pool } from 'pg'

/**
 * PostgreSQL 连接池（infra/postgres/）。
 * better-auth（账户/会话）、drizzle（conversation_threads）、LangGraph checkpoint 共用同一库；
 * drizzle 与 better-auth 复用本 Pool，PostgresSaver 走自身的 fromConnString 内部连接。
 */
export const pool = new Pool({ connectionString: env.DATABASE_URL })

/** 当前数据库连接串（供 PostgresSaver.fromConnString 复用） */
export function dbConnectionString(): string {
  return env.DATABASE_URL
}

/** 进程退出前清理（测试/优雅关闭用） */
export async function closePool(): Promise<void> {
  await pool.end()
}
