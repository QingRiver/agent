import { spawnSync } from 'node:child_process'
import { fail } from './docker'
import { REPO_ROOT } from './paths'

/**
 * qlib 数据运维：委托仓库根的 `scripts/qlib-daily-update.ts` 与 `scripts/qlib-package-source.ts`。
 * 本文件只做 argv 透传，不重复实现 qlib 逻辑。
 */

function delegate(script: string, args: string[]): void {
  const result = spawnSync('tsx', [script, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
  if (result.status !== 0)
    fail(`qlib 命令失败 (exit ${result.status ?? 'unknown'})`)
}

export function qlibInit(): void {
  delegate('scripts/qlib-daily-update.ts', ['init'])
}

export function qlibUpdate(args: string[]): void {
  delegate('scripts/qlib-daily-update.ts', ['update', ...args])
}

export function qlibPackage(mode: 'package' | 'unpack', args: string[]): void {
  delegate('scripts/qlib-package-source.ts', [mode, ...args])
}
