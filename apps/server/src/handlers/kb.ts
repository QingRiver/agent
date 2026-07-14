import type { Context } from 'hono'
import type {
  KbBatchCommit,
  KbCommit,
  KbCreateDoc,
  KbCreateNode,
  KbDraftUpdate,
  KbIngestPathRequest,
  KbIngestText,
  KbListDocsQuery,
  KbMetaUpdate,
  KbQueryRequest,
  KbUpdateNode,
} from '../../shared/kb'
import type { AppEnv, AuthUser } from '../types'
import { Buffer } from 'node:buffer'
import { HTTPException } from 'hono/http-exception'
import { notFound, requireOwned } from '../http/errors'
import { KbService } from '../service/kb'

export class KbHandlers {
  // ---------- 文件夹节点 ----------

  static async listNodes(c: Context<AppEnv>, user: AuthUser, kbId?: string) {
    const nodes = await KbService.listNodes(KbService.resolveKbId(kbId), user.id)
    return c.json({ nodes })
  }

  static async createNode(c: Context<AppEnv>, user: AuthUser, req: KbCreateNode) {
    const node = await KbService.createFolder({
      kbId: KbService.resolveKbId(req.kbId),
      ...(req.parentId != null ? { parentId: req.parentId } : {}),
      name: req.name,
      owner: user.id,
    })
    return c.json({ node })
  }

  static async updateNode(c: Context<AppEnv>, user: AuthUser, id: string, req: KbUpdateNode) {
    const existing = requireOwned(await KbService.getNode(id), user.id)
    const node = await KbService.updateFolder({
      kbId: existing.kbId,
      nodeId: id,
      ...(req.name != null ? { name: req.name } : {}),
      ...(req.parentId !== undefined ? { parentId: req.parentId } : {}),
    })
    if (!node)
      notFound()
    return c.json({ node })
  }

  static async deleteNode(c: Context<AppEnv>, user: AuthUser, id: string) {
    const existing = requireOwned(await KbService.getNode(id), user.id)
    if (!(await KbService.deleteFolder(existing.kbId, id)))
      notFound()
    return c.json({ ok: true })
  }

  // ---------- 文档草稿 ----------

  static async listDocs(c: Context<AppEnv>, user: AuthUser, q: KbListDocsQuery) {
    // 默认只看自己的；显式 owner 也只能等于当前用户
    const owner = q.owner != null && q.owner === user.id ? q.owner : user.id
    const docs = await KbService.listDocs({
      kbId: KbService.resolveKbId(q.kbId),
      owner,
      ...(q.tag != null ? { tag: q.tag } : {}),
      ...(q.vdir != null ? { vdirPrefix: q.vdir } : {}),
      ...(q.parentNodeId !== undefined ? { parentNodeId: q.parentNodeId } : {}),
    })
    return c.json({ docs })
  }

  static async getDoc(c: Context<AppEnv>, user: AuthUser, id: string) {
    const doc = requireOwned(await KbService.getDoc(id), user.id)
    return c.json({ doc })
  }

  static async createDoc(c: Context<AppEnv>, user: AuthUser, req: KbCreateDoc) {
    const doc = await KbService.createDraft({
      kbId: KbService.resolveKbId(req.kbId),
      ...(req.parentNodeId != null ? { parentNodeId: req.parentNodeId } : {}),
      name: req.name,
      ...(req.content != null ? { content: req.content } : {}),
      owner: user.id,
      ...(req.tags ? { tags: req.tags } : {}),
    })
    return c.json({ doc })
  }

  static async patchDoc(c: Context<AppEnv>, user: AuthUser, id: string, req: KbDraftUpdate & KbMetaUpdate) {
    requireOwned(await KbService.getDoc(id), user.id)

    // 有 content → 草稿保存；否则元数据更新
    let doc = null
    if (req.content !== undefined) {
      doc = await KbService.saveDraft(id, { content: req.content, ...(req.name != null ? { name: req.name } : {}) })
    }
    else {
      const { name, tags, parentNodeId, owner, visibility, pinned } = req
      doc = await KbService.updateMeta(id, {
        ...(name != null ? { name } : {}),
        ...(tags != null ? { tags } : {}),
        ...(parentNodeId !== undefined ? { parentNodeId } : {}),
        ...(owner !== undefined ? { owner } : {}),
        ...(visibility != null ? { visibility } : {}),
        ...(pinned != null ? { pinned } : {}),
      })
    }
    if (!doc)
      notFound()
    return c.json({ doc })
  }

  static async commit(c: Context<AppEnv>, user: AuthUser, id: string, req: KbCommit) {
    requireOwned(await KbService.getDoc(id), user.id)
    const doc = await KbService.commit(id, { ...(req.skipEnrich ? { skipEnrich: true } : {}) })
    return c.json({ doc })
  }

  static async batchCommit(c: Context<AppEnv>, user: AuthUser, req: KbBatchCommit) {
    for (const id of req.ids)
      requireOwned(await KbService.getDoc(id), user.id)
    await KbService.commitBatch(req.ids, { ...(req.skipEnrich ? { skipEnrich: true } : {}) })
    return c.json({ ok: true })
  }

  static async deleteDoc(c: Context<AppEnv>, user: AuthUser, id: string) {
    requireOwned(await KbService.getDoc(id), user.id)
    if (!(await KbService.removeDoc(id)))
      notFound()
    return c.json({ ok: true })
  }

  static async listTags(c: Context<AppEnv>, user: AuthUser, kbId?: string) {
    const tags = await KbService.listTags(KbService.resolveKbId(kbId), user.id)
    return c.json({ tags })
  }

  // ---------- 引入（markitdown → 草稿） ----------

  static async ingest(c: Context<AppEnv>, user: AuthUser) {
    const body = await c.req.parseBody({ all: true })
    const rawFiles = body.files
    const files = (Array.isArray(rawFiles) ? rawFiles : [rawFiles]).filter(
      (f): f is File => f instanceof File,
    )
    if (!files.length)
      throw new HTTPException(400, { message: 'files is required' })

    const kbId = typeof body.kbId === 'string' ? body.kbId : undefined
    const tags = typeof body.tags === 'string'
      ? body.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined
    const parentNodeId = typeof body.parentNodeId === 'string' ? body.parentNodeId : undefined

    const fileData = await Promise.all(files.map(async f => ({
      buffer: Buffer.from(await f.arrayBuffer()),
      filename: f.name,
    })))

    const items = await KbService.ingestFiles({
      kbId: KbService.resolveKbId(kbId),
      files: fileData,
      ...(parentNodeId ? { parentNodeId } : {}),
      owner: user.id,
      ...(tags ? { tags } : {}),
    })
    return c.json({ items })
  }

  static async ingestPath(c: Context<AppEnv>, user: AuthUser, req: KbIngestPathRequest) {
    const items = await KbService.ingestFromPath({
      kbId: KbService.resolveKbId(req.kbId),
      serverPath: req.path,
      ...(req.base ? { base: req.base } : {}),
      owner: user.id,
      ...(req.tags ? { tags: req.tags } : {}),
    })
    return c.json({ items })
  }

  static async ingestText(c: Context<AppEnv>, user: AuthUser, req: KbIngestText) {
    const doc = await KbService.ingestText({
      kbId: KbService.resolveKbId(req.kbId),
      content: req.content,
      name: req.name,
      ...(req.parentNodeId != null ? { parentNodeId: req.parentNodeId } : {}),
      owner: user.id,
      ...(req.tags ? { tags: req.tags } : {}),
    })
    return c.json({ doc })
  }

  // ---------- 检索（兼容） ----------

  static async query(c: Context<AppEnv>, _user: AuthUser, req: KbQueryRequest) {
    const result = await KbService.query(req.query, req.kbId)
    return c.json({ result })
  }

  static async manage(c: Context<AppEnv>, user: AuthUser) {
    const kbId = c.req.query('kbId') ?? undefined
    const docs = await KbService.listDocs({
      kbId: KbService.resolveKbId(kbId),
      owner: user.id,
    })
    return c.json({ kbId: KbService.resolveKbId(kbId), documents: docs })
  }
}
