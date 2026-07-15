/**
 * 清空知识库可见数据（PG docs/nodes/tags + Qdrant points），便于重新导入带结构内容。
 *
 * 用法（推荐经 devops）:
 *   pnpm devops e2e clear-kb --email you@example.com
 *   pnpm devops e2e clear-kb --owner <userId>
 *   pnpm devops e2e clear-kb --all                  # 整库 kbId（默认 env.KB_COLLECTION）
 *   pnpm devops e2e clear-kb --email x --dry-run
 *
 * 直接调用:
 *   pnpm --filter server exec tsx scripts/clear-kb.ts --email you@example.com
 */
import process from 'node:process'
import { parseArgs } from 'node:util'
import { env } from '@agent/env'
import {
  deleteByPointIds,
  ensureCollection,
  getQdrantClient,
  resolveCollectionName,
} from '@agent/kb'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { bootstrapDatabases } from '../src/db/bootstrap'
import { closePool, pool } from '../src/db/client'
import { db } from '../src/db/drizzle'
import { kbChunks, kbDocuments, kbNodes, kbTags } from '../src/db/schema'

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    'email': { type: 'string' },
    'owner': { type: 'string' },
    'all': { type: 'boolean', default: false },
    'kb-id': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'help': { type: 'boolean', short: 'h', default: false },
  },
})

function printHelp(): void {
  console.log(`用法: clear-kb (--email <addr> | --owner <userId> | --all) [--kb-id id] [--dry-run]

按 owner 清空当前用户可见知识库（文档 / 文件夹 / 标签 + Qdrant），或 --all 清空整个 kbId。
默认 kbId = env.KB_COLLECTION（通常 kb_default）。
`)
}

async function resolveOwnerId(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM "user" WHERE email = $1 LIMIT 1`,
    [email],
  )
  const id = rows[0]?.id
  if (!id)
    throw new Error(`未找到用户 email=${email}`)
  return id
}

async function clearByOwner(kbId: string, owner: string, dryRun: boolean): Promise<void> {
  const docs = await db
    .select({ id: kbDocuments.id })
    .from(kbDocuments)
    .where(and(eq(kbDocuments.kbId, kbId), eq(kbDocuments.owner, owner)))
  const docIds = docs.map(d => d.id)

  const chunkRows = docIds.length
    ? await db
        .select({ id: kbChunks.id })
        .from(kbChunks)
        .where(inArray(kbChunks.docId, docIds))
    : []
  const chunkIds = chunkRows.map(c => c.id)

  const [{ count: nodeCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kbNodes)
    .where(and(eq(kbNodes.kbId, kbId), eq(kbNodes.owner, owner)))
  const [{ count: tagCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kbTags)
    .where(and(eq(kbTags.kbId, kbId), eq(kbTags.owner, owner)))

  console.log(`[clear-kb] kbId=${kbId} owner=${owner}`)
  console.log(`[clear-kb] docs=${docIds.length} chunks=${chunkIds.length} nodes=${nodeCount} tags=${tagCount}`)

  if (dryRun) {
    console.log('[clear-kb] dry-run，未写入')
    return
  }

  if (chunkIds.length)
    await deleteByPointIds(kbId, chunkIds)

  // 兜底：payload.owner 残留点（历史无 PG 行）
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (exists.exists) {
    await client.delete(collectionName, {
      wait: true,
      filter: {
        must: [{ key: 'owner', match: { value: owner } }],
      },
    })
  }

  if (docIds.length) {
    await db.delete(kbDocuments).where(
      and(eq(kbDocuments.kbId, kbId), eq(kbDocuments.owner, owner)),
    )
  }
  await db.delete(kbTags).where(and(eq(kbTags.kbId, kbId), eq(kbTags.owner, owner)))
  await db.delete(kbNodes).where(and(eq(kbNodes.kbId, kbId), eq(kbNodes.owner, owner)))

  console.log('[clear-kb] done')
}

async function clearAll(kbId: string, dryRun: boolean): Promise<void> {
  const docs = await db
    .select({ id: kbDocuments.id })
    .from(kbDocuments)
    .where(eq(kbDocuments.kbId, kbId))
  const docIds = docs.map(d => d.id)
  const chunkRows = docIds.length
    ? await db
        .select({ id: kbChunks.id })
        .from(kbChunks)
        .where(inArray(kbChunks.docId, docIds))
    : []

  const [{ count: nodeCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kbNodes)
    .where(eq(kbNodes.kbId, kbId))
  const [{ count: tagCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kbTags)
    .where(eq(kbTags.kbId, kbId))

  console.log(`[clear-kb] ALL kbId=${kbId}`)
  console.log(`[clear-kb] docs=${docIds.length} chunks=${chunkRows.length} nodes=${nodeCount} tags=${tagCount}`)

  if (dryRun) {
    console.log('[clear-kb] dry-run，未写入')
    return
  }

  if (docIds.length)
    await db.delete(kbDocuments).where(eq(kbDocuments.kbId, kbId))
  await db.delete(kbTags).where(eq(kbTags.kbId, kbId))
  await db.delete(kbNodes).where(eq(kbNodes.kbId, kbId))

  // 整库重建 Qdrant collection，避免孤儿点
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(kbId)
  const exists = await client.collectionExists(collectionName)
  if (exists.exists) {
    await client.deleteCollection(collectionName)
    console.log(`[clear-kb] deleted qdrant collection ${collectionName}`)
  }
  await ensureCollection(kbId)
  console.log(`[clear-kb] recreated qdrant collection ${collectionName}`)
  console.log('[clear-kb] done')
}

async function main(): Promise<void> {
  if (values.help) {
    printHelp()
    return
  }

  const modes = [
    Boolean(values.email),
    Boolean(values.owner),
    Boolean(values.all),
  ].filter(Boolean).length
  if (modes !== 1) {
    printHelp()
    throw new Error('须且仅指定其一: --email | --owner | --all')
  }

  await bootstrapDatabases()
  const kbId = values['kb-id']?.trim() || env.KB_COLLECTION
  const dryRun = Boolean(values['dry-run'])

  try {
    if (values.all) {
      await clearAll(kbId, dryRun)
      return
    }
    const owner = values.owner?.trim()
      || (values.email ? await resolveOwnerId(values.email.trim()) : '')
    if (!owner)
      throw new Error('无法解析 owner')
    if (values.email)
      console.log(`[clear-kb] email=${values.email.trim()} → owner=${owner}`)
    await clearByOwner(kbId, owner, dryRun)
  }
  finally {
    await closePool()
  }
}

main().catch((err) => {
  console.error('[clear-kb] failed', err)
  process.exit(1)
})
