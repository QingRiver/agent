import process from 'node:process'

/**
 * 断言失败即退出进程。
 * e2e 脚本以 exit code 表达通过/失败（CI 据此判定），故断言失败直接 `process.exit(1)`，
 * 无需在调用栈逐层 try/catch 传播。
 */
export function fail(message: string): never {
  console.error(`\n[e2e] 错误: ${message}`)
  process.exit(1)
}
