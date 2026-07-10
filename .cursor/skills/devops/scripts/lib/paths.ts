import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIB_DIR = dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = resolve(LIB_DIR, '..')

/** 仓库根目录 */
export const REPO_ROOT = resolve(LIB_DIR, '../../../../..')

export const INFRA = {
  qdrant: join(REPO_ROOT, 'infra/qdrant'),
  markitdown: join(REPO_ROOT, 'infra/markitdown'),
  qlib: join(REPO_ROOT, 'infra/qlib'),
} as const

export type InfraTarget = keyof typeof INFRA | 'kb' | 'all'

export const KB_AGENT_E2E_SH = join(SCRIPTS_DIR, 'kb-agent-e2e.sh')
export const HITL_AGENT_E2E_TS = join(SCRIPTS_DIR, 'hitl-agent-e2e.ts')
