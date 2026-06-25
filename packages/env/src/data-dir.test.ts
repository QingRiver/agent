import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot, resolveDataDir } from './data-dir'

describe('resolveDataDir', () => {
  it('相对路径基于 monorepo 根目录', () => {
    expect(resolveDataDir('apps/server/data')).toBe(
      path.join(repoRoot, 'apps/server/data'),
    )
  })

  it('旧 DATA_DIR=./data 映射到 apps/server/data', () => {
    expect(resolveDataDir('./data')).toBe(
      path.join(repoRoot, 'apps/server/data'),
    )
  })
})
