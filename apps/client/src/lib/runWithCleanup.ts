/**
 * 无论成功或失败都执行 cleanup，错误继续上抛。
 * 放在组件外：React Compiler 尚不支持组件内无 catch 的 try/finally。
 */
export async function runWithCleanup<T>(
  fn: () => Promise<T>,
  cleanup: () => void,
): Promise<T> {
  try {
    return await fn()
  }
  finally {
    cleanup()
  }
}
