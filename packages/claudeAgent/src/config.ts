import type { Options } from './sdk'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readOnlyOptions } from './presets'

/** `packages/claudeAgent` 根目录（含 `.claude/settings.local.json`） */
export const claudeAgentPackageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/**  monorepo 根目录 */
export const repoRoot = path.resolve(claudeAgentPackageRoot, '../..')

/**
 * 默认 query 选项：`cwd` 指向本包，加载 `.claude/settings.local.json`（`settingSources: local`）。
 * 工具仍可访问 `additionalDirectories` 中的仓库根目录。
 */
export function claudePackageQueryOptions(overrides: Partial<Options> = {}): Options {
  const env: Record<string, string> = { ...process.env as Record<string, string> }
  for (const key of ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'] as const) {
    const value = process.env[key]
    if (value)
      env[key] = value
  }

  return readOnlyOptions({
    cwd: claudeAgentPackageRoot,
    settingSources: ['local', 'project'],
    additionalDirectories: [repoRoot],
    env,
    ...overrides,
  })
}
