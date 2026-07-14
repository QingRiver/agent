import type { AppEnv, AuthUser } from './types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from '@agent/env'
import { getQdrantClient, resolveCollectionName } from '@agent/kb'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db/drizzle'
import { migrateAppSchema } from './db/migrate'
import { kbChunks, kbDocuments, kbNodes } from './db/schema'
import { kbRoutes } from './routes/kb'
import { KbConflictError, KbService } from './service/kb'

const TEST_USER: AuthUser = { id: 'kb-test-user', email: 'kb@t', name: 'kb' }
const OTHER_USER: AuthUser = { id: 'kb-other-user', email: 'other@t', name: 'other' }
const RUN_TAG = randomUUID().slice(0, 8)
const KB_IDS = new Set<string>()

function newKb(): string {
  const kbId = `kb_test_${RUN_TAG}_${randomUUID().slice(0, 6)}`
  KB_IDS.add(kbId)
  return kbId
}

function makeApp(user: AuthUser) {
  return new Hono<AppEnv>()
    .use('*', async (c, next) => {
      c.set('user', user)
      c.set('session', null)
      await next()
    })
    .route('/', kbRoutes)
}

const app = makeApp(TEST_USER)
const otherApp = makeApp(OTHER_USER)

async function cleanupKb(kbId: string): Promise<void> {
  await db.delete(kbDocuments).where(eq(kbDocuments.kbId, kbId))
  await db.delete(kbNodes).where(eq(kbNodes.kbId, kbId))
  const client = getQdrantClient()
  const name = resolveCollectionName(kbId)
  const exists = await client.collectionExists(name)
  if (exists.exists)
    await client.deleteCollection(name)
}

async function assertNoResidue(): Promise<void> {
  for (const kbId of KB_IDS) {
    const docs = await db.select().from(kbDocuments).where(eq(kbDocuments.kbId, kbId))
    const nodes = await db.select().from(kbNodes).where(eq(kbNodes.kbId, kbId))
    expect(docs.length, `${kbId} docs`).toBe(0)
    expect(nodes.length, `${kbId} nodes`).toBe(0)
    const client = getQdrantClient()
    const exists = await client.collectionExists(resolveCollectionName(kbId))
    expect(exists.exists, `${kbId} collection 应已删除`).toBe(false)
  }
}

beforeAll(async () => {
  await migrateAppSchema()
})

afterAll(async () => {
  for (const kbId of KB_IDS)
    await cleanupKb(kbId)
  await assertNoResidue()
})

// ============================================================
// PG 逻辑（无外部依赖，总是跑）
// ============================================================
describe('kb PG 逻辑', () => {
  const kbId = newKb()
  let folderId: string
  let docId: string

  it('建文件夹 + 列出', async () => {
    const node = await KbService.createFolder({ kbId, name: 'notes', owner: TEST_USER.id })
    expect(node.name).toBe('notes')
    folderId = node.id
    const list = await KbService.listNodes(kbId)
    expect(list.some(n => n.id === folderId)).toBe(true)
  })

  it('根级同名第二次 createFolder → unique 冲突', async () => {
    await expect(KbService.createFolder({ kbId, name: 'notes', owner: TEST_USER.id })).rejects.toThrow()
  })

  it('ensureNodePath 建嵌套链', async () => {
    const leaf = await KbService.ensureNodePath({ kbId, segments: ['notes', 'rust', 'lang'], owner: TEST_USER.id })
    expect(leaf).not.toBeNull()
    const list = await KbService.listNodes(kbId)
    expect(list.some(n => n.name === 'rust')).toBe(true)
    expect(list.some(n => n.name === 'lang')).toBe(true)
  })

  it('createDraft 派生 vdir + status=draft', async () => {
    const parent = await KbService.ensureNodePath({ kbId, segments: ['notes', 'rust'], owner: TEST_USER.id })
    const doc = await KbService.createDraft({ kbId, parentNodeId: parent, name: 'basics', content: '# Basics\nhello', owner: TEST_USER.id, tags: ['t1'] })
    docId = doc.id
    expect(doc.indexingStatus).toBe('draft')
    expect(doc.vdir).toBe('notes/rust/basics')
    expect(doc.draftHash).not.toBeNull()
    expect(doc.publishedHash).toBeNull()
  })

  it('saveDraft 内容变 → draftHash 更新；标脏只在 completed→draft', async () => {
    const before = (await KbService.getDoc(docId))!
    const updated = (await KbService.saveDraft(docId, { content: '# Basics\nhello world' }))!
    expect(updated.draftHash).not.toBe(before.draftHash)
    expect(updated.indexingStatus).toBe('draft')
  })

  it('saveDraft during indexing → KbConflictError', async () => {
    await db.update(kbDocuments).set({ indexingStatus: 'indexing' }).where(eq(kbDocuments.id, docId))
    await expect(KbService.saveDraft(docId, { content: 'x' })).rejects.toBeInstanceOf(KbConflictError)
    await db.update(kbDocuments).set({ indexingStatus: 'draft' }).where(eq(kbDocuments.id, docId))
  })

  it('listDocs vdir 前缀过滤（不误伤 notes2）+ tag 过滤', async () => {
    await KbService.createDraft({ kbId, name: 'orphan', content: 'x', owner: TEST_USER.id })
    // 造一条 notes2/... 不应被 notes 前缀命中
    const n2 = await KbService.createFolder({ kbId, name: 'notes2', owner: TEST_USER.id })
    const d2 = await KbService.createDraft({ kbId, parentNodeId: n2.id, name: 'x', content: 'y', owner: TEST_USER.id })

    const byVdir = await KbService.listDocs({ kbId, vdirPrefix: 'notes' })
    expect(byVdir.some(d => d.id === docId)).toBe(true)
    expect(byVdir.some(d => d.id === d2.id)).toBe(false)

    const byTag = await KbService.listDocs({ kbId, tag: 't1' })
    expect(byTag.some(d => d.id === docId)).toBe(true)
    const noMatch = await KbService.listDocs({ kbId, tag: 'nope' })
    expect(noMatch.length).toBe(0)
  })

  it('updateMeta 改名 → vdir 重算', async () => {
    const updated = (await KbService.updateMeta(docId, { name: 'basics-v2' }))!
    expect(updated.vdir).toBe('notes/rust/basics-v2')
  })

  it('updateMeta 移动 → vdir 重算', async () => {
    const newParent = await KbService.createFolder({ kbId, name: 'other', owner: TEST_USER.id })
    const updated = (await KbService.updateMeta(docId, { parentNodeId: newParent.id }))!
    expect(updated.vdir).toBe('other/basics-v2')
  })

  it('moveNode 环检测', async () => {
    const a = await KbService.createFolder({ kbId, name: 'cycle-a', owner: TEST_USER.id })
    const b = await KbService.createFolder({ kbId, parentId: a.id, name: 'cycle-b', owner: TEST_USER.id })
    await expect(KbService.moveNode(kbId, a.id, b.id)).rejects.toBeInstanceOf(KbConflictError)
    await expect(KbService.moveNode(kbId, a.id, a.id)).rejects.toBeInstanceOf(KbConflictError)
  })

  it('listTags 聚合（可按 owner）', async () => {
    const tags = await KbService.listTags(kbId, TEST_USER.id)
    expect(tags).toContain('t1')
  })

  it('commit 409 守卫（手动置 indexing）', async () => {
    await db.update(kbDocuments).set({ indexingStatus: 'indexing' }).where(eq(kbDocuments.id, docId))
    await expect(KbService.commit(docId, { skipEnrich: true })).rejects.toBeInstanceOf(KbConflictError)
    await db.update(kbDocuments).set({ indexingStatus: 'draft' }).where(eq(kbDocuments.id, docId))
  })

  it('removeDoc 删除', async () => {
    const ok = await KbService.removeDoc(docId)
    expect(ok).toBe(true)
    expect(await KbService.getDoc(docId)).toBeNull()
  })

  it('deleteFolder → 子文档回退根级', async () => {
    const f = await KbService.createFolder({ kbId, name: 'delfolder', owner: TEST_USER.id })
    const d = await KbService.createDraft({ kbId, parentNodeId: f.id, name: 'inner', content: 'x', owner: TEST_USER.id })
    await KbService.deleteFolder(kbId, f.id)
    const after = await KbService.getDoc(d.id)
    expect(after).not.toBeNull()
    expect(after!.parentNodeId).toBeNull()
    expect(after!.vdir).toBe('inner')
  })

  it('ingestText 直建草稿', async () => {
    const doc = await KbService.ingestText({ kbId, content: '# Hi\nsome text', name: 'paste1', owner: TEST_USER.id })
    expect(doc.indexingStatus).toBe('draft')
    expect(doc.content).toContain('Hi')
  })

  it('ingestFiles .md → 草稿 + 去重 skip', async () => {
    const buf = Buffer.from('# Title\nbody content here')
    const r1 = await KbService.ingestFiles({ kbId, files: [{ buffer: buf, filename: 'a.md' }], owner: TEST_USER.id })
    expect(r1).toHaveLength(1)
    expect(r1[0]!.skipped).toBe(false)
    const r2 = await KbService.ingestFiles({ kbId, files: [{ buffer: buf, filename: 'a.md' }], owner: TEST_USER.id })
    expect(r2[0]!.skipped).toBe(true)
  })

  it('ingestFromPath 递归两层目录', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kb-ingest-'))
    try {
      await mkdir(path.join(root, 'sub'), { recursive: true })
      await writeFile(path.join(root, 'top.md'), '# Top\nhello')
      await writeFile(path.join(root, 'sub', 'nested.md'), '# Nested\nworld')
      const items = await KbService.ingestFromPath({ kbId, serverPath: root, base: root, owner: TEST_USER.id })
      expect(items.length).toBe(2)
      const nested = items.find(i => i.name === 'nested')
      expect(nested).toBeDefined()
      expect(nested!.vdir).toBe('sub/nested')
      const top = items.find(i => i.name === 'top')
      expect(top!.vdir).toBe('top')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('ingestFromPath 超过 5 层子目录则跳过', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kb-ingest-deep-'))
    try {
      const deep = path.join(root, 'a', 'b', 'c', 'd', 'e', 'f')
      await mkdir(deep, { recursive: true })
      await writeFile(path.join(root, 'a', 'b', 'c', 'd', 'e', 'ok.md'), '# ok')
      await writeFile(path.join(deep, 'too-deep.md'), '# too deep')
      const items = await KbService.ingestFromPath({ kbId, serverPath: root, base: root, owner: TEST_USER.id })
      expect(items.some(i => i.name === 'ok')).toBe(true)
      expect(items.some(i => i.name === 'too-deep')).toBe(false)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('ingestFromPath base 非 ancestor → .. 逃逸拒绝', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'kb-esc-'))
    const other = await mkdtemp(path.join(tmpdir(), 'kb-esc-other-'))
    try {
      await writeFile(path.join(root, 'a.md'), '# a')
      // base=other 不含 root/a.md → rel 含 '..' → sanitize 抛 KbConflictError
      await expect(KbService.ingestFromPath({ kbId, serverPath: root, base: other, owner: TEST_USER.id })).rejects.toBeInstanceOf(KbConflictError)
    }
    finally {
      await rm(root, { recursive: true, force: true })
      await rm(other, { recursive: true, force: true })
    }
  })

  it('saveDraft 把 error 复位 draft 并清 error', async () => {
    const doc = await KbService.createDraft({ kbId, name: 'err-reset', content: 'v1', owner: TEST_USER.id })
    await db.update(kbDocuments).set({ indexingStatus: 'error', error: 'boom' }).where(eq(kbDocuments.id, doc.id))
    const saved = (await KbService.saveDraft(doc.id, { content: 'v2' }))!
    expect(saved.indexingStatus).toBe('draft')
    expect(saved.error).toBeNull()
    expect(saved.draftHash).not.toBe(doc.draftHash)
  })

  it('文件夹同级重名 → 409 KbConflictError', async () => {
    await KbService.createFolder({ kbId, name: 'dup', owner: TEST_USER.id })
    const y = await KbService.createFolder({ kbId, name: 'y', owner: TEST_USER.id })
    // 把 y 改名为已存在的 dup → uniq_kb_nodes_parent_name 冲突
    await expect(KbService.updateFolder({ kbId, nodeId: y.id, name: 'dup' })).rejects.toBeInstanceOf(KbConflictError)
  })
})

// ============================================================
// HTTP 路由层
// ============================================================
describe('kb HTTP 路由', () => {
  const kbId = newKb()

  it('路由建文件夹 POST /nodes → 200', async () => {
    const res = await app.request('/nodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kbId, name: 'rnode' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.node.name).toBe('rnode')
    expect(body.node.kbId).toBe(kbId)
  })

  it('路由 updateNode 用资源 kbId（非默认 collection）', async () => {
    const created = await KbService.createFolder({ kbId, name: 'to-rename', owner: TEST_USER.id })
    const res = await app.request(`/nodes/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'renamed' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.node.name).toBe('renamed')
    expect(body.node.kbId).toBe(kbId)
  })

  it('路由列表文档 GET /documents 默认只看自己', async () => {
    await KbService.createDraft({ kbId, name: 'rdoc', content: 'c', owner: TEST_USER.id })
    await KbService.createDraft({ kbId, name: 'other-doc', content: 'c', owner: OTHER_USER.id })
    const res = await app.request(`/documents?kbId=${kbId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.docs.some((d: { name: string }) => d.name === 'rdoc')).toBe(true)
    expect(body.docs.some((d: { name: string }) => d.name === 'other-doc')).toBe(false)
  })

  it('他人 getDoc → 404', async () => {
    const doc = await KbService.createDraft({ kbId, name: 'private-doc', content: 'secret', owner: TEST_USER.id })
    const res = await otherApp.request(`/documents/${doc.id}`)
    expect(res.status).toBe(404)
  })

  it('他人 patchDoc → 404', async () => {
    const doc = await KbService.createDraft({ kbId, name: 'priv-patch', content: 'a', owner: TEST_USER.id })
    const res = await otherApp.request(`/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hacked' }),
    })
    expect(res.status).toBe(404)
  })

  it('路由草稿保存 PATCH /documents/:id（含 content）', async () => {
    const doc = await KbService.createDraft({ kbId, name: 'rpatch', content: 'a', owner: TEST_USER.id })
    const res = await app.request(`/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'b' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.doc.content).toBe('b')
  })

  it('路由取不存在文档 404', async () => {
    const res = await app.request(`/documents/${randomUUID()}`)
    expect(res.status).toBe(404)
  })

  it('路由校验失败 400', async () => {
    const res = await app.request('/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kbId }), // 缺 name
    })
    expect(res.status).toBe(400)
  })

  it('parentNodeId=null 列出根文档', async () => {
    const folder = await KbService.createFolder({ kbId, name: 'only-folder', owner: TEST_USER.id })
    await KbService.createDraft({ kbId, parentNodeId: folder.id, name: 'in-folder', content: 'x', owner: TEST_USER.id })
    const rootDoc = await KbService.createDraft({ kbId, name: 'root-only', content: 'y', owner: TEST_USER.id })
    const res = await app.request(`/documents?kbId=${kbId}&parentNodeId=null`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.docs.some((d: { id: string }) => d.id === rootDoc.id)).toBe(true)
    expect(body.docs.every((d: { parentNodeId: string | null }) => d.parentNodeId == null)).toBe(true)
  })
})

// ============================================================
// 提交流水线 + 检索（需 embedding 服务）
// ============================================================
const hasEmbedding = !!env.SILICONFLOW_API_KEY

describe.runIf(hasEmbedding)('kb 提交流水线', () => {
  const kbId = newKb()
  let docId: string
  let chunkIdsBefore: string[]
  let folderForRename: string

  it('commit(skipEnrich) → chunks=Qdrant点数 + completed', async () => {
    folderForRename = (await KbService.createFolder({ kbId, name: 'folder-a', owner: TEST_USER.id })).id
    const doc = await KbService.createDraft({
      kbId,
      parentNodeId: folderForRename,
      name: 'commit-test',
      content: '# 退款政策\nSKU-9001 是某商品的编号，工号 E12345 负责该商品的售后。',
      owner: TEST_USER.id,
    })
    docId = doc.id
    const committed = await KbService.commit(docId, { skipEnrich: true })
    expect(committed.indexingStatus).toBe('completed')
    expect(committed.publishedHash).toBe(committed.draftHash)
    expect(committed.indexedAt).not.toBeNull()

    const chunks = await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId))
    chunkIdsBefore = chunks.map(c => c.id)
    expect(chunks.length).toBeGreaterThan(0)

    const client = getQdrantClient()
    const coll = resolveCollectionName(kbId)
    const count = await client.count(coll, { exact: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    expect(count.count).toBe(chunks.length)
  })

  it('retrieve 命中提交内容', async () => {
    const result = await KbService.query('SKU-9001', kbId)
    expect(result.chunks.some(c => c.raw_text.includes('SKU-9001'))).toBe(true)
  })

  it('移动文档不重 embed（chunk id + Qdrant 点不变，payload vdir 更新）', async () => {
    const folder = await KbService.createFolder({ kbId, name: 'moved', owner: TEST_USER.id })
    await KbService.updateMeta(docId, { parentNodeId: folder.id })

    const chunksAfter = (await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId))).map(c => c.id)
    expect([...chunksAfter].sort()).toEqual([...chunkIdsBefore].sort())

    const client = getQdrantClient()
    const coll = resolveCollectionName(kbId)
    const count = await client.count(coll, { exact: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    expect(count.count).toBe(chunkIdsBefore.length)

    const scrolled = await client.scroll(coll, { limit: 1, with_payload: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    const vdir = scrolled.points[0]?.payload?.vdir
    expect(vdir).toBe('moved/commit-test')
  })

  it('renameNode → Qdrant vdir 同步，chunk id 不变', async () => {
    // 文档当前在 moved/；把 moved 文件夹重命名
    const moved = (await KbService.listNodes(kbId)).find(n => n.name === 'moved')!
    await KbService.renameNode(kbId, moved.id, 'moved-renamed')

    const chunksAfter = (await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId))).map(c => c.id)
    expect([...chunksAfter].sort()).toEqual([...chunkIdsBefore].sort())

    const client = getQdrantClient()
    const coll = resolveCollectionName(kbId)
    const scrolled = await client.scroll(coll, { limit: 1, with_payload: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    expect(scrolled.points[0]?.payload?.vdir).toBe('moved-renamed/commit-test')

    const doc = await KbService.getDoc(docId)
    expect(doc!.vdir).toBe('moved-renamed/commit-test')
  })

  it('removeDoc 后 Qdrant 无残留', async () => {
    await KbService.removeDoc(docId)
    const client = getQdrantClient()
    const coll = resolveCollectionName(kbId)
    const count = await client.count(coll, { exact: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    expect(count.count).toBe(0)
    const chunks = await db.select().from(kbChunks).where(eq(kbChunks.docId, docId))
    expect(chunks.length).toBe(0)
  })
})

// ============================================================
// 召回（多文档实际检索，需 embedding 服务）
// ============================================================
describe.runIf(hasEmbedding)('kb 召回', () => {
  const kbId = newKb()
  const docs = new Map<string, string>()

  beforeAll(async () => {
    const seed: Array<{ name: string, content: string }> = [
      {
        name: 'refund-policy',
        content: [
          '# 退款政策',
          '商品 SKU-9001 的售后服务由工号 E12345 的同事负责，如有质量问题请联系。',
          '退款需在购买后 7 天内发起，凭订单号与发货单申请。',
          'SKU-9001 属于不支持无理由退货类目，仅质量问题可退。',
        ].join('\n'),
      },
      {
        name: 'rust-async',
        content: [
          '# Rust 异步编程',
          '使用 tokio runtime 运行 async fn，Future 是惰性的，需要 .await 才会执行。',
          'tokio::main 宏自动设置 runtime；spawn 创建并发任务，JoinHandle 等待结果。',
          '不要在 async 里调用阻塞 API，会拖垮整个 runtime。',
        ].join('\n'),
      },
      {
        name: 'pg-index',
        content: [
          '# PostgreSQL 索引优化',
          '慢查询先用 EXPLAIN ANALYZE 看执行计划，seq scan 过万行就考虑加索引。',
          'GIN 索引适合数组和全文检索，btree 适合等值与范围查询。',
          '外键列建议加 btree，tags 数组列用 GIN。',
        ].join('\n'),
      },
      {
        name: 'weekly-meeting',
        content: [
          '# 团队周会纪要',
          'Q3 路线图：知识库一期做服务端，二期做前端三栏。',
          '排期：服务端 7 月底完成，前端 8 月启动。',
          '待办：补召回测试、补权限字段、移动端适配。',
        ].join('\n'),
      },
    ]

    for (const s of seed) {
      const doc = await KbService.createDraft({ kbId, name: s.name, content: s.content, owner: TEST_USER.id })
      docs.set(s.name, doc.id)
      await KbService.commit(doc.id, { skipEnrich: true })
    }
  })

  const cases: Array<[string, string]> = [
    ['SKU-9001 退款找谁负责', 'refund-policy'],
    ['tokio 怎么跑 async 函数', 'rust-async'],
    ['pg 慢查询怎么排查', 'pg-index'],
    ['Q3 知识库排期', 'weekly-meeting'],
  ]

  for (const [query, expectedName] of cases) {
    it(`召回「${query}」→ 命中 ${expectedName}`, async () => {
      const result = await KbService.query(query, kbId)
      expect(result.chunks.length).toBeGreaterThan(0)
      const expectedDocId = docs.get(expectedName)!
      expect(result.chunks[0]!.source_doc_id).toBe(expectedDocId)
      expect(result.chunks.some(c => c.source_doc_id === expectedDocId)).toBe(true)
    })
  }

  it('不相关查询也能返回结果但不要求特定文档', async () => {
    const result = await KbService.query('今天天气怎么样', kbId)
    expect(result).toBeDefined()
    expect(Array.isArray(result.chunks)).toBe(true)
  })
})
