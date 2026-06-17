import type { ServerEnv } from './schema'
import path from 'node:path'
import process from 'node:process'
import { loadWorkspaceEnv } from './load'
import { ServerEnvSchema } from './schema'

function initEnv(): ServerEnv {
  loadWorkspaceEnv()
  return ServerEnvSchema.parse(process.env)
}

/** 加载根 `.env` 并经 zod 校验；import 本模块即初始化 */
export const env = initEnv()

/** 解析后的数据目录绝对路径（相对 `process.cwd()`） */
export const dataDirPath = path.resolve(process.cwd(), env.DATA_DIR)
