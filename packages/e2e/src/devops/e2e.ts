import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fail } from './docker'
import { E2E_RUNNER_TS, REPO_ROOT } from './paths'

/**
 * e2e 编排：seed / vitest / agent flow 的执行入口。
 *
 * 注意：agent flow 的测试实现已迁入 packages/e2e/src/flows/，经 runner.ts 调度；
 * 本文件只负责 spawn（pnpm vitest / server seed tsx / e2e runner），不含任何 flow 逻辑与业务断言。
 */

/** 在 REPO_ROOT 跑命令，注入额外 env；非 0 退出即 fail。 */
function runInRepo(command: string, args: string[], env?: Record<string, string>): void {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0)
    fail(`${command} ${args.join(' ')} 失败 (exit ${result.status ?? 'unknown'})`)
}

/** 写入 E2E 账号到 server postgres（直接调 better-auth API，server 进程内执行） */
export function e2eAuthSeed(): void {
  console.log('[devops] e2e auth seed')
  runInRepo('pnpm', ['--filter', 'server', 'exec', 'tsx', 'scripts/seed-e2e-user.ts'])
}

/** 写入 kb 种子数据（server：草稿 → commit） */
export function e2eKbSeed(): void {
  console.log('[devops] e2e kb seed')
  runInRepo('pnpm', ['--filter', 'server', 'exec', 'tsx', 'scripts/seed-kb.ts'])
}

/** kb 管线 e2e（apps/server vitest，E2E=1，需 infra up kb + postgres） */
export function e2eKb(): void {
  console.log('[devops] e2e kb pipeline (vitest)')
  runInRepo('pnpm', ['exec', 'vitest', 'run', 'apps/server/src/kb.e2e.test.ts'], { E2E: '1' })
}

/** kb agent SSE flow（需 pnpm dev + e2e seed + infra up kb） */
export function e2eKbAgent(): void {
  console.log('[devops] e2e kb agent (需要 server: pnpm dev)')
  runInRepo('pnpm', ['exec', 'tsx', E2E_RUNNER_TS, 'kb-agent'])
}

/** playwright UI flow（需 pnpm dev + e2e auth）：驱动真实浏览器验证 AG-UI 前端交互 */
export function e2eUi(): void {
  console.log('[devops] e2e ui (playwright,需要 server: pnpm dev)')
  runInRepo('pnpm', ['--filter', '@agent/e2e', 'exec', 'playwright', 'test', '--reporter=line'])
}

/** hitl 图 vitest（packages/graph，不需 server） */
export function e2eHitl(): void {
  console.log('[devops] e2e hitl graph (vitest)')
  runInRepo('pnpm', ['exec', 'vitest', 'run', 'packages/graph/src/hitlGraph.test.ts'])
}

/** hitl agent SSE flow（需 pnpm dev + e2e auth） */
export function e2eHitlAgent(): void {
  console.log('[devops] e2e hitl agent (需要 server: pnpm dev)')
  runInRepo('pnpm', ['exec', 'tsx', E2E_RUNNER_TS, 'hitl-agent'])
}

/** e2e all：seed → kb vitest → hitl vitest（不含 agent SSE，需另起 dev） */
export function e2eAll(): void {
  console.log('[devops] e2e all: seed → kb vitest → hitl vitest\n')
  e2eAuthSeed()
  e2eKbSeed()
  e2eKb()
  e2eHitl()
  console.log('\n[devops] 跳过 agent SSE（需另开终端 `pnpm dev` 后执行 `pnpm devops e2e agent` 或 `hitl-agent`）')
}

export type E2eTarget = 'all' | 'seed' | 'auth' | 'kb' | 'hitl' | 'agent' | 'hitl-agent' | 'ui'

export function runE2e(target: E2eTarget): void {
  switch (target) {
    case 'all':
      e2eAll()
      break
    case 'seed':
      e2eAuthSeed()
      e2eKbSeed()
      break
    case 'auth':
      e2eAuthSeed()
      break
    case 'kb':
      e2eKb()
      break
    case 'hitl':
      e2eHitl()
      break
    case 'agent':
      e2eKbAgent()
      break
    case 'hitl-agent':
      e2eHitlAgent()
      break
    case 'ui':
      e2eUi()
      break
    default:
      fail(`未知 e2e 目标: ${target}`)
  }
}
