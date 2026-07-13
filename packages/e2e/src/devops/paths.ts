import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * devops 基础路径。
 *
 * 注：本文件位于 `packages/e2e/src/devops/`，故 REPO_ROOT 需向上 4 级
 * （devops → src → e2e → packages → repo root）。改文件层级时同步调整 `..` 数量。
 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))

/** 仓库根目录（绝对路径，不依赖 process.cwd） */
export const REPO_ROOT = resolve(LIB_DIR, '../../../..')

/** 各 infra 服务的 compose 目录 */
export const INFRA = {
  postgres: join(REPO_ROOT, 'infra/postgres'),
  qdrant: join(REPO_ROOT, 'infra/qdrant'),
  markitdown: join(REPO_ROOT, 'infra/markitdown'),
  qlib: join(REPO_ROOT, 'infra/qlib'),
} as const

export type InfraTarget = keyof typeof INFRA | 'kb' | 'all'

/** @agent/e2e flow runner（flow 实现在 packages/e2e/src/flows/） */
export const E2E_RUNNER_TS = join(REPO_ROOT, 'packages/e2e/src/runner.ts')
