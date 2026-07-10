import { spawnSync } from 'node:child_process'
import { HITL_AGENT_E2E_TS, KB_AGENT_E2E_SH, REPO_ROOT } from './paths'
import { fail, run } from './docker'

function runInRepo(command: string, args: string[], env?: Record<string, string>): void {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0)
    fail(`${command} ${args.join(' ')} 失败 (exit ${result.status ?? 'unknown'})`)
}

export function e2eAuthSeed(): void {
  console.log('[devops] e2e auth seed')
  runInRepo('pnpm', ['--filter', 'server', 'exec', 'tsx', 'scripts/seed-e2e-user.ts'])
}

export function e2eKbSeed(): void {
  console.log('[devops] e2e kb seed')
  runInRepo('pnpm', ['exec', 'vitest', 'run', 'packages/kb/src/seed.test.ts'], { KB_SEED: '1' })
}

export function e2eKb(): void {
  console.log('[devops] e2e kb pipeline (vitest)')
  runInRepo('pnpm', ['exec', 'vitest', 'run', 'packages/kb/src/e2e.test.ts'], { E2E: '1' })
}

export function e2eKbAgent(): void {
  console.log('[devops] e2e kb agent (需要 server: pnpm dev)')
  const result = run('bash', [KB_AGENT_E2E_SH], { inherit: true })
  if (!result.ok)
    fail('kb agent e2e 失败（确认 server 已启动: pnpm dev）')
}

export function e2eHitl(): void {
  console.log('[devops] e2e hitl graph (vitest)')
  runInRepo('pnpm', ['exec', 'vitest', 'run', 'packages/graph/src/hitlGraph.test.ts'])
}

export function e2eHitlAgent(): void {
  console.log('[devops] e2e hitl agent (需要 server: pnpm dev)')
  runInRepo('pnpm', ['exec', 'tsx', HITL_AGENT_E2E_TS])
}

export function e2eAll(): void {
  console.log('[devops] e2e all: seed → kb vitest → hitl vitest\n')
  e2eAuthSeed()
  e2eKbSeed()
  e2eKb()
  e2eHitl()
  console.log('\n[devops] 跳过 agent SSE（需另开终端 `pnpm dev` 后执行 `pnpm devops e2e agent` 或 `hitl-agent`）')
}

export type E2eTarget = 'all' | 'seed' | 'auth' | 'kb' | 'hitl' | 'agent' | 'hitl-agent'

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
    default:
      fail(`未知 e2e 目标: ${target}`)
  }
}
