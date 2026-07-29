import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fail } from './docker'
import { E2E_RUNNER_TS, REPO_ROOT } from './paths'

/**
 * e2e 编排：seed / vitest / 真实 HTTP/SSE flow 的执行入口。
 *
 * 注意：真实 HTTP/SSE flow 的测试实现位于 packages/e2e/src/flows/，经 runner.ts 调度；
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

/** KB 内部管线集成测试（不是 HTTP E2E）。 */
export function e2eKbPipeline(): void {
  console.log('[devops] e2e kb pipeline (vitest)')
  runInRepo('pnpm', ['exec', 'vitest', 'run', 'apps/server/src/kb.e2e.test.ts'], { E2E: '1' })
}

/** shared tags 真实 HTTP flow（需 pnpm dev + e2e auth）。 */
export function e2eTags(): void {
  console.log('[devops] e2e shared tags HTTP flow (需要 server: pnpm dev)')
  runInRepo('pnpm', ['exec', 'tsx', E2E_RUNNER_TS, 'tags'])
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
  runInRepo('pnpm', ['exec', 'vitest', 'run', 'packages/graph/src/graphs/dev.test.ts'])
}

/** hitl agent SSE flow（需 pnpm dev + e2e auth） */
export function e2eHitlAgent(): void {
  console.log('[devops] e2e hitl agent (需要 server: pnpm dev)')
  runInRepo('pnpm', ['exec', 'tsx', E2E_RUNNER_TS, 'hitl-agent'])
}

/** 全部 E2E：完成 seed 后依次执行集成、HTTP/SSE 与浏览器流程。 */
export function e2eAll(): void {
  console.log('[devops] e2e all: seed → kb pipeline → tags → hitl graph → kb agent → hitl agent → ui\n')
  e2eAuthSeed()
  e2eKbSeed()
  e2eKbPipeline()
  e2eTags()
  e2eHitl()
  e2eKbAgent()
  e2eHitlAgent()
  e2eUi()
}

/** 清空知识库可见数据（按 email/owner，或 --all 整库） */
export function e2eClearKb(opts: {
  email?: string
  owner?: string
  all?: boolean
  kbId?: string
  dryRun?: boolean
}): void {
  console.log('[devops] e2e clear-kb')
  const args = ['--filter', 'server', 'exec', 'tsx', 'scripts/clear-kb.ts']
  if (opts.email)
    args.push('--email', opts.email)
  if (opts.owner)
    args.push('--owner', opts.owner)
  if (opts.all)
    args.push('--all')
  if (opts.kbId)
    args.push('--kb-id', opts.kbId)
  if (opts.dryRun)
    args.push('--dry-run')
  runInRepo('pnpm', args)
}

export type E2eTarget
  = | 'all'
    | 'seed'
    | 'auth'
    | 'kb-pipeline'
    | 'tags'
    | 'hitl'
    | 'agent'
    | 'hitl-agent'
    | 'ui'
    | 'clear-kb'

export function runE2e(
  target: E2eTarget,
  opts?: {
    email?: string
    owner?: string
    all?: boolean
    kbId?: string
    dryRun?: boolean
  },
): void {
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
    case 'kb-pipeline':
      e2eKbPipeline()
      break
    case 'tags':
      e2eTags()
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
    case 'clear-kb': {
      const clearOpts: {
        email?: string
        owner?: string
        all?: boolean
        kbId?: string
        dryRun?: boolean
      } = {}
      if (opts?.email != null)
        clearOpts.email = opts.email
      if (opts?.owner != null)
        clearOpts.owner = opts.owner
      if (opts?.all != null)
        clearOpts.all = opts.all
      if (opts?.kbId != null)
        clearOpts.kbId = opts.kbId
      if (opts?.dryRun != null)
        clearOpts.dryRun = opts.dryRun
      e2eClearKb(clearOpts)
      break
    }
    default:
      fail(`未知 e2e 目标: ${target}`)
  }
}
