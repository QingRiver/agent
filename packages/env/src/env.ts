import process from 'node:process'
import { resolveDataDir } from './data-dir'
import { loadWorkspaceEnv } from './load'
import { ServerEnvSchema } from './schema'

function initEnv() {
  loadWorkspaceEnv()
  return ServerEnvSchema.parse(process.env)
}

/** 加载根 `.env` 并经 zod 校验；import 本模块即初始化 */
export const env = initEnv()

/** 解析后的数据目录绝对路径 */
export const dataDirPath = resolveDataDir(env.DATA_DIR)

export { repoRoot, resolveDataDir } from './data-dir'
