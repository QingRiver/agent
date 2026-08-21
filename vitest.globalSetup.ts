import { migrateAppSchema } from './apps/server/gateway/src/db/migrate'

/**
 * vitest 全局 setup：在所有测试 worker 启动前，对 postgres 应用一次 drizzle 迁移。
 *
 * 多个 e2e 测试文件各自在 beforeAll 调 migrateAppSchema()，fresh DB 下并发 CREATE TABLE
 * 会撞 pg_type 唯一约束（duplicate key typname）。这里主进程预先 migrate 一次，各 worker
 * 再调时 drizzle 迁移日志已记录 0000 → no-op，消除竞态。依赖 `pnpm devops infra up test`
 * 已启动 postgres（`pnpm test` 脚本保证）。
 */
export async function setup(): Promise<void> {
  await migrateAppSchema()
}
