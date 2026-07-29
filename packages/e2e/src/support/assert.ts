/**
 * 断言失败抛错，由 runner 统一转换为 exit code 1。
 * 抛错而非立即 process.exit，保证 flow 的 finally 清理真实测试数据。
 */
export function fail(message: string): never {
  throw new Error(`[e2e] ${message}`)
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    fail(message)
}
