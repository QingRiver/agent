import type { AppEnv, AuthUser } from './types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { env } from '@agent/env'
import { deleteByPointIds, getQdrantClient, resolveCollectionName } from '@agent/kb'
import { ProjectDirError } from '@agent/project'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from './db/drizzle'
import { migrateAppSchema } from './db/migrate'
import { dirs, kbChunks, kbDocuments } from './db/schema'
import { kbRoutes } from './routes/kb'
import { KbConflictError, KbService } from './service/kb'
import { ProjectService } from './service/project'
import { TagsService } from './service/tags'

const TEST_USER: AuthUser = { id: 'kb-test-user', email: 'kb@t', name: 'kb' }
const OTHER_USER: AuthUser = { id: 'kb-other-user', email: 'other@t', name: 'other' }
const RUN_TAG = randomUUID().slice(0, 8)
const USERS = [TEST_USER.id, OTHER_USER.id]

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

/** 单用户清理：best-effort 清 Qdrant 点 + PG 行 + dirs。全局 collection 不删（共享）。 */
async function cleanupUser(userId: string): Promise<void> {
  const docs = await db.select({ id: kbDocuments.id, kbId: kbDocuments.kbId }).from(kbDocuments).where(eq(kbDocuments.userId, userId))
  for (const d of docs) {
    const chunks = await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, d.id))
    try {
      await deleteByPointIds(d.kbId, chunks.map(c => c.id))
    }
    catch {
      // Qdrant 可能未起，best-effort
    }
  }
  await db.delete(kbDocuments).where(eq(kbDocuments.userId, userId))
  await db.delete(dirs).where(eq(dirs.userId, userId))
}

async function assertNoResidue(userId: string): Promise<void> {
  const docs = await db.select().from(kbDocuments).where(eq(kbDocuments.userId, userId))
  const userDirs = await db.select().from(dirs).where(eq(dirs.userId, userId))
  expect(docs.length, `${userId} docs`).toBe(0)
  expect(userDirs.length, `${userId} dirs`).toBe(0)
}

beforeAll(async () => {
  await migrateAppSchema()
  for (const u of USERS)
    await cleanupUser(u)
})

afterAll(async () => {
  for (const u of USERS)
    await cleanupUser(u)
  for (const u of USERS)
    await assertNoResidue(u)
})

// ============================================================
// PG 逻辑（无外部依赖，总是跑）
// ============================================================
describe('kb PG 逻辑', () => {
  const projName = `pg-${RUN_TAG}`
  let projectId: string
  let dirId: string
  let docId: string

  it('建项目 + 建 dir + createDraft 派生 vdir/projectId + status=draft', async () => {
    const proj = await ProjectService.createProject(TEST_USER.id, { name: projName })
    projectId = proj.id
    const dir = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'rust' })
    dirId = dir.id

    const doc = await KbService.createDraft({
      userId: TEST_USER.id,
      mountDirId: dirId,
      name: 'basics',
      content: '# Basics\nhello',
      tags: ['t1'],
    })
    docId = doc.id
    expect(doc.indexingStatus).toBe('draft')
    expect(doc.vdir).toBe(`${projName}/rust/basics`)
    expect(doc.mountDirId).toBe(dirId)
    expect(doc.projectId).toBe(projectId)
    expect(doc.userId).toBe(TEST_USER.id)
    expect(doc.draftHash).not.toBeNull()
    expect(doc.publishedHash).toBeNull()
  })

  it('inbox 文档（mountDirId=null）vdir=name', async () => {
    const doc = await KbService.createDraft({ userId: TEST_USER.id, name: 'orphan', content: 'x' })
    expect(doc.vdir).toBe('orphan')
    expect(doc.mountDirId).toBeNull()
    expect(doc.projectId).toBeNull()
  })

  it('saveDraft 内容变 → draftHash 更新', async () => {
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

  it('listDocs: dirId 精确 / includeDescendants 子树 / tagId 过滤', async () => {
    // docId 在 dirId(rust) 下；再造一个其它项目下的文档不应命中
    const otherProj = await ProjectService.createProject(TEST_USER.id, { name: `${projName}-other` })
    const d2 = await KbService.createDraft({ userId: TEST_USER.id, mountDirId: otherProj.id, name: 'x', content: 'y' })

    const exact = await KbService.listDocs({ userId: TEST_USER.id, dirId })
    expect(exact.some(d => d.id === docId)).toBe(true)
    expect(exact.some(d => d.id === d2.id)).toBe(false)

    // includeDescendants：从 project 根应含子树文档
    const subtree = await KbService.listDocs({ userId: TEST_USER.id, dirId: projectId, includeDescendants: true })
    expect(subtree.some(d => d.id === docId)).toBe(true)
    expect(subtree.some(d => d.id === d2.id)).toBe(false)

    const t1Id = (await TagsService.ensureByNames(TEST_USER.id, ['t1'])).get('t1')!
    const byTag = await KbService.listDocs({ userId: TEST_USER.id, tagId: t1Id })
    expect(byTag.some(d => d.id === docId)).toBe(true)
    const noMatch = await KbService.listDocs({ userId: TEST_USER.id, tagId: randomUUID() })
    expect(noMatch.length).toBe(0)
  })

  it('updateMeta 改名 → vdir 重算（PG only）', async () => {
    const updated = (await KbService.updateMeta(docId, { name: 'basics-v2' }))!
    expect(updated.vdir).toBe(`${projName}/rust/basics-v2`)
  })

  it('updateMeta 移动 mountDirId → vdir + projectId 重 stamp', async () => {
    const newDir = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'other' })
    const updated = (await KbService.updateMeta(docId, { mountDirId: newDir.id }))!
    expect(updated.vdir).toBe(`${projName}/other/basics-v2`)
    expect(updated.mountDirId).toBe(newDir.id)
    expect(updated.projectId).toBe(projectId) // 同 project，projectId 不变
  })

  it('文件夹同级重名 → ProjectDirError', async () => {
    await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'dup' })
    const y = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'y' })
    await expect(ProjectService.rename(TEST_USER.id, y.id, 'dup')).rejects.toBeInstanceOf(ProjectDirError)
  })

  it('move 环检测 → ProjectDirError', async () => {
    const a = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'cycle-a' })
    const b = await ProjectService.createDir(TEST_USER.id, { parentId: a.id, name: 'cycle-b' })
    // 把 a 移到 b（b 在 a 子树内）→ 环
    await expect(ProjectService.move(TEST_USER.id, a.id, { newParentId: b.id })).rejects.toBeInstanceOf(ProjectDirError)
    // 移到自身
    await expect(ProjectService.move(TEST_USER.id, a.id, { newParentId: a.id })).rejects.toBeInstanceOf(ProjectDirError)
  })

  it('delete 非空文件夹（有挂载文档）→ ProjectDirError', async () => {
    const f = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'delfolder' })
    await KbService.createDraft({ userId: TEST_USER.id, mountDirId: f.id, name: 'inner', content: 'x' })
    await expect(ProjectService.delete(TEST_USER.id, f.id)).rejects.toBeInstanceOf(ProjectDirError)
  })

  it('delete 空文件夹 → ok', async () => {
    const f = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'empty-folder' })
    await ProjectService.delete(TEST_USER.id, f.id)
    const tree = await ProjectService.listTree(TEST_USER.id)
    expect(tree.some(d => d.id === f.id)).toBe(false)
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

  it('ingestText 直建草稿', async () => {
    const doc = await KbService.ingestText({ userId: TEST_USER.id, content: '# Hi\nsome text', name: 'paste1' })
    expect(doc.indexingStatus).toBe('draft')
    expect(doc.content).toContain('Hi')
  })

  it('ingestFiles .md → 草稿 + 去重 skip', async () => {
    const buf = Buffer.from('# Title\nbody content here')
    const r1 = await KbService.ingestFiles({ userId: TEST_USER.id, files: [{ buffer: buf, filename: 'a.md' }] })
    expect(r1).toHaveLength(1)
    expect(r1[0]!.skipped).toBe(false)
    const r2 = await KbService.ingestFiles({ userId: TEST_USER.id, files: [{ buffer: buf, filename: 'a.md' }] })
    expect(r2[0]!.skipped).toBe(true)
  })

  /** 用 jszip 构造测试压缩包：files 为 { 路径: 内容 } */
  async function makeZip(files: Record<string, string>): Promise<Buffer> {
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files))
      zip.file(name, content)
    return Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
  }

  it('ingestFromZip 递归两层目录（按 zip 路径还原 dirs 子树）', async () => {
    const zip = await makeZip({
      'top.md': '# Top\nhello',
      'sub/nested.md': '# Nested\nworld',
    })
    const items = await KbService.ingestFromZip({ userId: TEST_USER.id, zip, mountDirId: projectId })
    expect(items.length).toBe(2)
    const nested = items.find(i => i.name === 'nested')
    expect(nested).toBeDefined()
    expect(nested!.mountDirId).not.toBeNull() // 挂在 sub 子树
    const top = items.find(i => i.name === 'top')
    expect(top!.mountDirId).toBe(projectId)
  })

  it('ingestFromZip 超过 5 层子目录则跳过', async () => {
    const zip = await makeZip({
      'a/b/c/d/e/ok.md': '# ok',
      'a/b/c/d/e/f/too-deep.md': '# too deep',
    })
    const items = await KbService.ingestFromZip({ userId: TEST_USER.id, zip, mountDirId: projectId })
    expect(items.some(i => i.name === 'ok')).toBe(true)
    expect(items.some(i => i.name === 'too-deep')).toBe(false)
  })

  it('ingestFromZip 只导入 .md/.markdown', async () => {
    const zip = await makeZip({
      'readme.md': '# readme',
      'notes.markdown': '# notes',
      'image.png': 'fake-png',
      'data.json': '{}',
      'sub/notes.txt': 'notes',
      'doc.docx': 'fake-docx',
    })
    const items = await KbService.ingestFromZip({ userId: TEST_USER.id, zip, mountDirId: projectId })
    expect(items.map(i => i.name).sort()).toEqual(['notes', 'readme'])
  })

  it('ingestFromZip 忽略 __MACOSX / AppleDouble / .DS_Store', async () => {
    const zip = await makeZip({
      'wiki/good.md': '# good',
      '__MACOSX/wiki/._PP.md': ' ATTR garbage',
      '__MACOSX/._wiki': ' ',
      'wiki/.DS_Store': 'store',
      'wiki/._hidden.md': ' appledouble',
    })
    const items = await KbService.ingestFromZip({ userId: TEST_USER.id, zip, mountDirId: projectId })
    expect(items.map(i => i.name)).toEqual(['good'])
  })

  it('saveDraft 把 error 复位 draft 并清 error', async () => {
    const doc = await KbService.createDraft({ userId: TEST_USER.id, name: 'err-reset', content: 'v1' })
    await db.update(kbDocuments).set({ indexingStatus: 'error', error: 'boom' }).where(eq(kbDocuments.id, doc.id))
    const saved = (await KbService.saveDraft(doc.id, { content: 'v2' }))!
    expect(saved.indexingStatus).toBe('draft')
    expect(saved.error).toBeNull()
    expect(saved.draftHash).not.toBe(doc.draftHash)
  })
})

// ============================================================
// HTTP 路由层
// ============================================================
describe('kb HTTP 路由', () => {
  const projName = `http-${RUN_TAG}`
  let projectId: string

  beforeAll(async () => {
    const proj = await ProjectService.createProject(TEST_USER.id, { name: projName })
    projectId = proj.id
  })

  it('路由建文档 POST /documents/create → 200', async () => {
    const res = await app.request('/documents/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'rdoc', mountDirId: projectId, content: 'c' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.doc.name).toBe('rdoc')
    expect(body.doc.mountDirId).toBe(projectId)
  })

  it('路由列表文档 POST /documents/list 默认只看自己（userId 隔离）', async () => {
    await KbService.createDraft({ userId: TEST_USER.id, mountDirId: projectId, name: 'mine', content: 'c' })
    await KbService.createDraft({ userId: OTHER_USER.id, name: 'other-doc', content: 'c' })
    const res = await app.request('/documents/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.docs.some((d: { name: string }) => d.name === 'mine')).toBe(true)
    expect(body.docs.some((d: { name: string }) => d.name === 'other-doc')).toBe(false)
  })

  it('路由 listDocs dirId + includeDescendants 列子树文档', async () => {
    const dir = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'sub' })
    await KbService.createDraft({ userId: TEST_USER.id, mountDirId: dir.id, name: 'in-sub', content: 'x' })
    const res = await app.request('/documents/list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dirId: projectId, includeDescendants: true }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.docs.some((d: { name: string }) => d.name === 'in-sub')).toBe(true)
  })

  it('他人 getDoc → 404', async () => {
    const doc = await KbService.createDraft({ userId: TEST_USER.id, name: 'private-doc', content: 'secret' })
    const res = await otherApp.request(`/documents/${doc.id}/get`, { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('他人 save-draft → 404', async () => {
    const doc = await KbService.createDraft({ userId: TEST_USER.id, name: 'priv-patch', content: 'a' })
    const res = await otherApp.request(`/documents/${doc.id}/save-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'hacked' }),
    })
    expect(res.status).toBe(404)
  })

  it('路由草稿保存 POST /documents/:id/save-draft（含 content）', async () => {
    const doc = await KbService.createDraft({ userId: TEST_USER.id, name: 'rpatch', content: 'a' })
    const res = await app.request(`/documents/${doc.id}/save-draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'b' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.doc.content).toBe('b')
  })

  it('路由取不存在文档 404', async () => {
    const res = await app.request(`/documents/${randomUUID()}/get`, { method: 'POST' })
    expect(res.status).toBe(404)
  })

  it('路由校验失败 400', async () => {
    const res = await app.request('/documents/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}), // 缺 name
    })
    expect(res.status).toBe(400)
  })
})

// ============================================================
// 提交流水线 + 检索（需 embedding 服务）
// ============================================================
const hasEmbedding = !!env.SILICONFLOW_API_KEY

describe.runIf(hasEmbedding)('kb 提交流水线 + Phase 2 零写/setPayload', () => {
  const projName = `pipe-${RUN_TAG}`
  let projectId: string
  let otherProjectId: string
  let docId: string
  let chunkIdsBefore: string[]

  beforeAll(async () => {
    projectId = (await ProjectService.createProject(TEST_USER.id, { name: projName })).id
    otherProjectId = (await ProjectService.createProject(TEST_USER.id, { name: `${projName}-p2` })).id
  })

  it('commit(skipEnrich) → chunks=Qdrant点数 + completed', async () => {
    const dir = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'folder-a' })
    const doc = await KbService.createDraft({
      userId: TEST_USER.id,
      mountDirId: dir.id,
      name: 'commit-test',
      content: '# 退款政策\nSKU-9001 是某商品的编号，工号 E12345 负责该商品的售后。',
    })
    docId = doc.id
    const committed = await KbService.commit(docId, { skipEnrich: true })
    expect(committed.indexingStatus).toBe('completed')
    expect(committed.publishedHash).toBe(committed.draftHash)

    const chunks = await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId))
    chunkIdsBefore = chunks.map(c => c.id)
    expect(chunks.length).toBeGreaterThan(0)

    const client = getQdrantClient()
    const coll = resolveCollectionName('ignored')
    const count = await client.count(coll, { exact: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    expect(count.count).toBe(chunks.length)
  })

  it('retrieve 命中提交内容', async () => {
    const result = await KbService.query('SKU-9001')
    expect(result.chunks.some(c => c.raw_text.includes('SKU-9001'))).toBe(true)
  })

  it('phase 2: 文档移动不重 embed + setPayload(mount_dir_id/project_id)，无 vdir', async () => {
    const newDir = await ProjectService.createDir(TEST_USER.id, { parentId: projectId, name: 'moved' })
    await KbService.updateMeta(docId, { mountDirId: newDir.id })

    // chunk id 不变（不重 embed）
    const chunksAfter = (await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId))).map(c => c.id)
    expect([...chunksAfter].sort()).toEqual([...chunkIdsBefore].sort())

    const client = getQdrantClient()
    const coll = resolveCollectionName('ignored')
    const scrolled = await client.scroll(coll, {
      limit: 1,
      with_payload: true,
      filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] },
    })
    const payload = (scrolled.points[0]?.payload ?? {}) as Record<string, unknown>
    expect(payload.mount_dir_id).toBe(newDir.id)
    expect(payload.project_id).toBe(projectId)
    expect('vdir' in payload).toBe(false)
  })

  it('phase 2: 文件夹改名零 Qdrant 写（payload 不变，无 vdir）', async () => {
    const client = getQdrantClient()
    const coll = resolveCollectionName('ignored')
    const before = await client.scroll(coll, { limit: 1, with_payload: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    const payloadBefore = before.points[0]?.payload as Record<string, unknown>

    // 改名 moved 所在 dir（find dir named 'moved'）
    const tree = await ProjectService.listTree(TEST_USER.id)
    const moved = tree.find(d => d.name === 'moved')!
    await ProjectService.rename(TEST_USER.id, moved.id, 'moved-renamed')

    // chunk id 不变
    const chunksAfter = (await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId))).map(c => c.id)
    expect([...chunksAfter].sort()).toEqual([...chunkIdsBefore].sort())

    // payload 完全不变（零写：vdir 不进 payload，认 id）
    const after = await client.scroll(coll, { limit: 1, with_payload: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    const payloadAfter = after.points[0]?.payload as Record<string, unknown>
    expect(payloadAfter).toEqual(payloadBefore)
    expect('vdir' in payloadAfter).toBe(false)

    // dirs 树已改名；doc.vdir 为软缓存（folder 改名不刷 docs.vdir，client 据 dir 树重派生）
    const treeAfter = await ProjectService.listTree(TEST_USER.id)
    expect(treeAfter.some(d => d.name === 'moved-renamed')).toBe(true)
    expect(treeAfter.some(d => d.name === 'moved')).toBe(false)
  })

  it('phase 2: 跨 project move → setPayload(project_id)，不重 embed', async () => {
    // 把 moved-renamed dir 移到 otherProject 根下
    const tree = await ProjectService.listTree(TEST_USER.id)
    const moved = tree.find(d => d.name === 'moved-renamed')!
    await ProjectService.move(TEST_USER.id, moved.id, { newParentId: otherProjectId })

    const chunksAfter = (await db.select({ id: kbChunks.id }).from(kbChunks).where(eq(kbChunks.docId, docId))).map(c => c.id)
    expect([...chunksAfter].sort()).toEqual([...chunkIdsBefore].sort())

    const client = getQdrantClient()
    const coll = resolveCollectionName('ignored')
    const scrolled = await client.scroll(coll, { limit: 1, with_payload: true, filter: { must: [{ key: 'source_doc_id', match: { value: docId } }] } })
    const payload = scrolled.points[0]?.payload as Record<string, unknown>
    expect(payload.project_id).toBe(otherProjectId)
    expect('vdir' in payload).toBe(false)
  })

  it('commitBatch 并发：单篇失败不中断，聚合抛错', async () => {
    const doc = await KbService.createDraft({
      userId: TEST_USER.id,
      mountDirId: projectId,
      name: 'batch-ok',
      content: '# 批量提交\n并发提交应不因单篇失败而中断其余。',
    })
    await expect(KbService.commitBatch([doc.id, randomUUID()], { skipEnrich: true })).rejects.toThrow(/commitBatch: 1\/2 failed/)
    const row = await db.select().from(kbDocuments).where(eq(kbDocuments.id, doc.id)).limit(1)
    expect(row[0]!.indexingStatus).toBe('completed')
  })

  it('removeDoc 后 Qdrant 无残留', async () => {
    await KbService.removeDoc(docId)
    const client = getQdrantClient()
    const coll = resolveCollectionName('ignored')
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
  const projName = `recall-${RUN_TAG}`
  let projectId: string
  const docs = new Map<string, string>()

  beforeAll(async () => {
    projectId = (await ProjectService.createProject(TEST_USER.id, { name: projName })).id
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
      const doc = await KbService.createDraft({ userId: TEST_USER.id, mountDirId: projectId, name: s.name, content: s.content })
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
      const result = await KbService.query(query, undefined, { options: { skipRerank: true } })
      expect(result.chunks.length).toBeGreaterThan(0)
      const expectedDocId = docs.get(expectedName)!
      expect(result.chunks.some(c => c.source_doc_id === expectedDocId)).toBe(true)
    })
  }

  it('不相关查询也能返回结果但不要求特定文档', async () => {
    const result = await KbService.query('今天天气怎么样', undefined, { options: { skipRerank: true } })
    expect(result).toBeDefined()
    expect(Array.isArray(result.chunks)).toBe(true)
  })
})
