import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '@agent/env'
import { ingestDocument } from '@agent/kb'
import { describe, expect, it } from 'vitest'

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/e2e-policy.md',
)

const runSeed = process.env.KB_SEED === '1'

describe.runIf(runSeed)('kb seed', () => {
  it(`导入 fixture 到 ${env.KB_COLLECTION}`, async () => {
    const buffer = await readFile(FIXTURE)
    const result = await ingestDocument({
      buffer,
      filename: 'e2e-policy.md',
      kbId: env.KB_COLLECTION,
      skipEnrich: true,
      tags: ['seed'],
    })
    if (result.skipped) {
      expect(result.chunks_written).toBe(0)
    }
    else {
      expect(result.chunks_written).toBeGreaterThan(0)
    }
  })
})
