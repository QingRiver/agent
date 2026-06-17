import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export interface LoadWorkspaceEnvOptions {
  /** 根目录 `.env` 不存在时是否抛错（默认 `true`） */
  required?: boolean
}

/**
 * 将 monorepo 环境变量注入 `process.env`：
 * 1. 仓库根 `.env`
 * 2. `apps/server/.env`（可选覆盖）
 */
export function loadWorkspaceEnv(options: LoadWorkspaceEnvOptions = {}): void {
  const { required = true } = options
  const rootEnv = path.join(repoRoot, '.env')
  const serverEnv = path.join(repoRoot, 'apps/server/.env')

  if (!fs.existsSync(rootEnv)) {
    if (required) {
      throw new Error(
        `未找到 ${rootEnv}，请执行：cp .env.example .env`,
      )
    }
    return
  }

  const rootResult = config({ path: rootEnv })
  if (rootResult.error) {
    throw new Error(`加载 ${rootEnv} 失败：${rootResult.error.message}`)
  }

  if (fs.existsSync(serverEnv))
    config({ path: serverEnv, override: true })
}
