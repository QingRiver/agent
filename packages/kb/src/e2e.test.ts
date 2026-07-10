import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '@agent/env'
import {
  embedQuery,
  getQdrantClient,
  hybridRetrieve,
  ingestDocument,
  listDocumentSummaries,
  resolveCollectionName,
  retrieveAndRerank,
} from '@agent/kb'
import { beforeAll, describe, expect, it } from 'vitest'

const KB_E2E_COLLECTION = 'kb_e2e'
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/e2e-policy.md',
)

const runE2e = process.env.E2E === '1'

describe.runIf(runE2e)('kb e2e', () => {
  beforeAll(async () => {
    const client = getQdrantClient()
    const collectionName = resolveCollectionName(KB_E2E_COLLECTION)
    const exists = await client.collectionExists(collectionName)
    if (exists.exists)
      await client.deleteCollection(collectionName)
  })

  it('qdrant 健康', async () => {
    const response = await fetch(`${env.QDRANT_URL}/healthz`)
    expect(response.ok).toBe(true)
  })

  it('markitdown 健康', async () => {
    const response = await fetch(`${env.KB_MARKITDOWN_URL}/health`)
    expect(response.ok).toBe(true)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('siliconFlow embedding 返回 1024 维', async () => {
    if (!env.SILICONFLOW_API_KEY)
      throw new Error('SILICONFLOW_API_KEY 未设置，请在 .env 中配置后运行 pnpm devops e2e kb')

    const vector = await embedQuery('退款政策 SKU-9001')
    expect(vector).toHaveLength(1024)
  })

  it('导入 → hash-rebuild 跳过 → 混合召回 → rerank', async () => {
    if (!env.SILICONFLOW_API_KEY)
      throw new Error('SILICONFLOW_API_KEY 未设置')

    const buffer = await readFile(FIXTURE)

    const first = await ingestDocument({
      buffer,
      filename: 'e2e-policy.md',
      kbId: KB_E2E_COLLECTION,
      skipEnrich: true,
      tags: ['e2e'],
    })
    expect(first.skipped).toBe(false)
    expect(first.chunks_written).toBeGreaterThan(0)

    const second = await ingestDocument({
      buffer,
      filename: 'e2e-policy.md',
      kbId: KB_E2E_COLLECTION,
      skipEnrich: true,
    })
    expect(second.skipped).toBe(true)
    expect(second.chunks_written).toBe(0)

    const docs = await listDocumentSummaries(KB_E2E_COLLECTION)
    expect(docs.length).toBeGreaterThan(0)

    const hybrid = await hybridRetrieve({
      kbId: KB_E2E_COLLECTION,
      query: 'SKU-9001 是什么',
      recallK: 5,
    })
    expect(hybrid.some(chunk => chunk.raw_text.includes('SKU-9001'))).toBe(true)

    const reranked = await retrieveAndRerank(KB_E2E_COLLECTION, '工号 E12345 负责什么')
    expect(reranked.chunks.some(chunk => chunk.raw_text.includes('E12345'))).toBe(true)
  })
})
