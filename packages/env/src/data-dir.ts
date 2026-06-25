import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** monorepo 根目录（与 `load.ts` 一致，不依赖 process.cwd()） */
export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

/** 解析数据目录绝对路径（相对 monorepo 根，而非 process.cwd()） */
export function resolveDataDir(raw: string): string {
  if (path.isAbsolute(raw))
    return raw
  const relative = raw.replace(/^\.\//, '')
  // 旧默认 `./data` 在 server cwd 下等价于 apps/server/data；统一到此，避免根目录误建库
  const fromRoot = relative === 'data' ? 'apps/server/data' : relative
  return path.resolve(repoRoot, fromRoot)
}
