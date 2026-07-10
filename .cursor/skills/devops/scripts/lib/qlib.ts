import { spawnSync } from 'node:child_process'
import { REPO_ROOT } from './paths'
import { fail } from './docker'

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
