import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from '@agent/env'
import {
  embedQuery,
  getQdrantClient,
  hybridRetrieve,
  resolveCollectionName,
  retrieveAndRerank,
} from '@agent/kb'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db/drizzle'
import { migrateAppSchema } from './db/migrate'
import { kbDocuments, kbNodes } from './db/schema'
import { KbService } from './service/kb'

const runE2e = process.env.E2E === '1'
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/kb/fixtures/e2e-policy.md',
)
const OWNER = 'kb-e2e-owner'
const KB_ID = `kb_e2e_${Date.now().toString(36)}`

async function cleanup(): Promise<void> {
  await db.delete(kbDocuments).where(eq(kbDocuments.kbId, KB_ID))
  await db.delete(kbNodes).where(eq(kbNodes.kbId, KB_ID))
  const client = getQdrantClient()
  const name = resolveCollectionName(KB_ID)
  if ((await client.collectionExists(name)).exists)
    await client.deleteCollection(name)
}

describe.runIf(runE2e)('kb e2e（业务流：草稿 → 提交 → 检索）', () => {
  beforeAll(async () => {
    await migrateAppSchema()
    await cleanup()
  })

  afterAll(async () => {
    await cleanup()
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

  it('ingestFiles → commit → 改草稿再 commit → 混合召回 → rerank', async () => {
    if (!env.SILICONFLOW_API_KEY)
      throw new Error('SILICONFLOW_API_KEY 未设置')

    const buffer = Buffer.from(await readFile(FIXTURE))
    const items = await KbService.ingestFiles({
      kbId: KB_ID,
      files: [{ buffer, filename: 'e2e-policy.md' }],
      owner: OWNER,
      tags: ['e2e'],
    })
    expect(items).toHaveLength(1)
    expect(items[0]!.skipped).toBe(false)
    const docId = items[0]!.docId

    const committed = await KbService.commit(docId, { skipEnrich: true })
    expect(committed.indexingStatus).toBe('completed')
    expect(committed.publishedHash).toBe(committed.draftHash)

    // 业务流程：改草稿 → 再提交（整文档重建）
    const nextContent = `${committed.content}\n\n补充：SKU-9001 支持上门取件。`
    await KbService.saveDraft(docId, { content: nextContent })
    const recommitted = await KbService.commit(docId, { skipEnrich: true })
    expect(recommitted.indexingStatus).toBe('completed')
    expect(recommitted.draftHash).toBe(recommitted.publishedHash)

    const listed = await KbService.listDocs({ kbId: KB_ID, owner: OWNER })
    expect(listed.some(d => d.id === docId)).toBe(true)

    const hybrid = await hybridRetrieve({
      kbId: KB_ID,
      query: 'SKU-9001 是什么',
      recallK: 5,
    })
    expect(hybrid.some(chunk => chunk.raw_text.includes('SKU-9001'))).toBe(true)

    const reranked = await retrieveAndRerank(KB_ID, '工号 E12345 负责什么', {
      skipRerank: false,
      recallK: env.KB_RECALL_K,
    })
    expect(reranked.chunks.some(c => c.raw_text.includes('E12345'))).toBe(true)
    expect(reranked.chunks.some(c => c.source_doc_id === docId)).toBe(true)
  })
})
