/**
 * 清空知识库可见数据（PG docs/chunks/tags + Qdrant points），便于重新导入带结构内容。
 *
 * 统一 dirs 树后 KB 不再拥有文件夹树（已并入统一 dirs，归 ProjectService）；本脚本不动 dirs。
 *
 * 用法（推荐经 devops）:
 *   pnpm devops e2e clear-kb --email you@example.com
 *   pnpm devops e2e clear-kb --owner <userId>
 *   pnpm devops e2e clear-kb --all                  # 整库（全局 collection）
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
import { eq, inArray, sql } from 'drizzle-orm'
import { bootstrapDatabases } from '../src/db/bootstrap'
import { closePool, pool } from '../src/db/client'
import { db } from '../src/db/drizzle'
import { kbChunks, kbDocTags, kbDocuments } from '../src/db/schema'

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    'email': { type: 'string' },
    'owner': { type: 'string' },
    'all': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'help': { type: 'boolean', short: 'h', default: false },
  },
})

function printHelp(): void {
  console.log(`用法: clear-kb (--email <addr> | --owner <userId> | --all) [--dry-run]

按 owner 清空当前用户可见知识库（文档 / 标签 + Qdrant），或 --all 清空整库。
统一 dirs 树后 KB 文件夹树已并入 dirs，本脚本不清理 dirs。
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

async function clearByOwner(owner: string, dryRun: boolean): Promise<void> {
  const docs = await db
    .select({ id: kbDocuments.id })
    .from(kbDocuments)
    .where(eq(kbDocuments.owner, owner))
  const docIds = docs.map(d => d.id)

  const chunkRows = docIds.length
    ? await db
        .select({ id: kbChunks.id })
        .from(kbChunks)
        .where(inArray(kbChunks.docId, docIds))
    : []
  const chunkIds = chunkRows.map(c => c.id)

  const tagLinkRows = docIds.length
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(kbDocTags)
        .where(inArray(kbDocTags.docId, docIds))
    : []
  const tagLinkCount = tagLinkRows[0]?.count ?? 0

  console.log(`[clear-kb] owner=${owner}`)
  console.log(`[clear-kb] docs=${docIds.length} chunks=${chunkIds.length} tagLinks=${tagLinkCount}`)

  if (dryRun) {
    console.log('[clear-kb] dry-run，未写入')
    return
  }

  if (chunkIds.length)
    await deleteByPointIds(env.KB_COLLECTION, chunkIds)

  // 兜底：payload.owner 残留点（历史无 PG 行）
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(env.KB_COLLECTION)
  const exists = await client.collectionExists(collectionName)
  if (exists.exists) {
    await client.delete(collectionName, {
      wait: true,
      filter: {
        must: [{ key: 'owner', match: { value: owner } }],
      },
    })
  }

  if (docIds.length)
    await db.delete(kbDocuments).where(eq(kbDocuments.owner, owner))

  console.log('[clear-kb] done')
}

async function clearAll(dryRun: boolean): Promise<void> {
  const docs = await db
    .select({ id: kbDocuments.id })
    .from(kbDocuments)
  const docIds = docs.map(d => d.id)
  const chunkRows = docIds.length
    ? await db
        .select({ id: kbChunks.id })
        .from(kbChunks)
        .where(inArray(kbChunks.docId, docIds))
    : []
  const tagLinkRows = docIds.length
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(kbDocTags)
        .where(inArray(kbDocTags.docId, docIds))
    : []
  const tagLinkCount = tagLinkRows[0]?.count ?? 0

  console.log('[clear-kb] ALL')
  console.log(`[clear-kb] docs=${docIds.length} chunks=${chunkRows.length} tagLinks=${tagLinkCount}`)

  if (dryRun) {
    console.log('[clear-kb] dry-run，未写入')
    return
  }

  if (docIds.length)
    await db.delete(kbDocuments)

  // 整库重建 Qdrant collection，避免孤儿点（全局 collection）
  const client = getQdrantClient()
  const collectionName = resolveCollectionName(env.KB_COLLECTION)
  const exists = await client.collectionExists(collectionName)
  if (exists.exists) {
    await client.deleteCollection(collectionName)
    console.log(`[clear-kb] deleted qdrant collection ${collectionName}`)
  }
  await ensureCollection(env.KB_COLLECTION)
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
  const dryRun = Boolean(values['dry-run'])

  try {
    if (values.all) {
      await clearAll(dryRun)
      return
    }
    const owner = values.owner?.trim()
      || (values.email ? await resolveOwnerId(values.email.trim()) : '')
    if (!owner)
      throw new Error('无法解析 owner')
    if (values.email)
      console.log(`[clear-kb] email=${values.email.trim()} → owner=${owner}`)
    await clearByOwner(owner, dryRun)
  }
  finally {
    await closePool()
  }
}

main().catch((err) => {
  console.error('[clear-kb] failed', err)
  process.exit(1)
})
