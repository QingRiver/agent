import process from 'node:process'
import { FLOWS, runFlow } from './flows'

/**
 * E2e flow 的统一 CLI 入口。
 *
 * 调用方（devops skill）：
 *   pnpm exec tsx packages/e2e/src/runner.ts <flow>
 * 直接使用：
 *   pnpm exec tsx packages/e2e/src/runner.ts hitl-agent
 *
 * 退出码：0 通过，1 失败（CI 据此判定）。每个 flow 自行打印通过标记。
 */
async function main(): Promise<void> {
  const [name] = process.argv.slice(2)
  if (!name) {
    console.error('用法: tsx packages/e2e/src/runner.ts <flow>')
    console.error(`可用 flow: ${Object.keys(FLOWS).join(', ')}`)
    process.exit(1)
  }
  await runFlow(name)
}

main().catch((error: unknown) => {
  console.error('[e2e/runner] 失败:', error)
  process.exit(1)
})
