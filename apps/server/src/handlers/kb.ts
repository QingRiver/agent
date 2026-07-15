import type { Context } from 'hono'
import type {
  KbBatchCommit,
  KbCommit,
  KbCreateDoc,
  KbCreateNode,
  KbCreateTag,
  KbDeleteTag,
  KbDraftUpdate,
  KbIngestText,
  KbListDocsRequest,
  KbListNodesRequest,
  KbListTagsRequest,
  KbMetaUpdate,
  KbMoveNode,
  KbQueryRequest,
  KbRenameNode,
  KbRenameTag,
  KbUpdateTagColor,
} from '../../shared/kb'
import type { AppEnv, AuthUser } from '../types'
import { Buffer } from 'node:buffer'
import { HTTPException } from 'hono/http-exception'
import { notFound, requireOwned } from '../http/errors'
import { KbService } from '../service/kb'

export class KbHandlers {
  // ---------- 文件夹节点 ----------

  static async listNodes(c: Context<AppEnv>, user: AuthUser, req: KbListNodesRequest) {
    const nodes = await KbService.listNodes(KbService.resolveKbId(req.kbId), user.id)
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

  static async renameNode(c: Context<AppEnv>, user: AuthUser, id: string, req: KbRenameNode) {
    const existing = requireOwned(await KbService.getNode(id), user.id)
    const node = await KbService.renameFolder(existing.kbId, id, req.name)
    if (!node)
      notFound()
    return c.json({ node })
  }

  static async moveNode(c: Context<AppEnv>, user: AuthUser, id: string, req: KbMoveNode) {
    const existing = requireOwned(await KbService.getNode(id), user.id)
    const node = await KbService.moveFolder(existing.kbId, id, req.parentId)
    if (!node)
      notFound()
    return c.json({ node })
  }

  static async moveNodeToRoot(c: Context<AppEnv>, user: AuthUser, id: string) {
    const existing = requireOwned(await KbService.getNode(id), user.id)
    const node = await KbService.moveFolderToRoot(existing.kbId, id)
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

  static async listDocs(c: Context<AppEnv>, user: AuthUser, q: KbListDocsRequest) {
    // 默认只看自己的；显式 owner 也只能等于当前用户
    const owner = q.owner != null && q.owner === user.id ? q.owner : user.id
    const docs = await KbService.listDocs({
      kbId: KbService.resolveKbId(q.kbId),
      owner,
      ...(q.tag != null ? { tag: q.tag } : {}),
      ...(q.vdirPrefix != null ? { vdirPrefix: q.vdirPrefix } : {}),
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
      tags: req.tags,
    })
    return c.json({ doc })
  }

  static async patchDraft(c: Context<AppEnv>, user: AuthUser, id: string, req: KbDraftUpdate) {
    requireOwned(await KbService.getDoc(id), user.id)
    const doc = await KbService.saveDraft(id, req)
    if (!doc)
      notFound()
    return c.json({ doc })
  }

  static async patchMeta(c: Context<AppEnv>, user: AuthUser, id: string, req: KbMetaUpdate) {
    requireOwned(await KbService.getDoc(id), user.id)
    const doc = await KbService.updateMeta(id, req)
    if (!doc)
      notFound()
    return c.json({ doc })
  }

  static async commit(c: Context<AppEnv>, user: AuthUser, id: string, req: KbCommit) {
    requireOwned(await KbService.getDoc(id), user.id)
    const doc = await KbService.commit(id, { skipEnrich: req.skipEnrich === true })
    return c.json({ doc })
  }

  static async batchCommit(c: Context<AppEnv>, user: AuthUser, req: KbBatchCommit) {
    for (const id of req.ids)
      requireOwned(await KbService.getDoc(id), user.id)
    await KbService.commitBatch(req.ids, { skipEnrich: req.skipEnrich === true })
    return c.json({ ok: true })
  }

  static async deleteDoc(c: Context<AppEnv>, user: AuthUser, id: string) {
    requireOwned(await KbService.getDoc(id), user.id)
    if (!(await KbService.removeDoc(id)))
      notFound()
    return c.json({ ok: true })
  }

  static async listTags(c: Context<AppEnv>, user: AuthUser, req: KbListTagsRequest) {
    const tags = await KbService.listTags(KbService.resolveKbId(req.kbId), user.id)
    return c.json({ tags })
  }

  static async createTag(c: Context<AppEnv>, user: AuthUser, req: KbCreateTag) {
    const tag = await KbService.createTag({
      kbId: KbService.resolveKbId(req.kbId),
      name: req.name,
      ...(req.color != null ? { color: req.color } : {}),
      owner: user.id,
    })
    return c.json({ tag })
  }

  static async renameTag(c: Context<AppEnv>, user: AuthUser, id: string, req: KbRenameTag) {
    const result = await KbService.renameTag(id, req.name, user.id)
    if (!result)
      notFound()
    return c.json({ affectedDocs: result.affectedDocs })
  }

  static async deleteTag(c: Context<AppEnv>, user: AuthUser, id: string, req: KbDeleteTag) {
    const result = await KbService.deleteTag(id, user.id, req.dryRun === true)
    if (!result)
      notFound()
    return c.json({ affectedDocs: result.affectedDocs })
  }

  static async updateTagColor(
    c: Context<AppEnv>,
    user: AuthUser,
    id: string,
    req: KbUpdateTagColor,
  ) {
    const tag = await KbService.updateTagColor(id, req.color, user.id)
    if (!tag)
      notFound()
    return c.json({ tag })
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
    if (!kbId)
      throw new HTTPException(400, { message: 'kbId is required' })
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

  static async ingestZip(c: Context<AppEnv>, user: AuthUser) {
    const body = await c.req.parseBody({ all: true })
    const rawFile = body.file
    const file = Array.isArray(rawFile) ? rawFile[0] : rawFile
    if (!(file instanceof File))
      throw new HTTPException(400, { message: 'file (zip) is required' })

    const kbId = typeof body.kbId === 'string' ? body.kbId : undefined
    if (!kbId)
      throw new HTTPException(400, { message: 'kbId is required' })
    const tags = typeof body.tags === 'string'
      ? body.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined

    const zip = Buffer.from(await file.arrayBuffer())
    const items = await KbService.ingestFromZip({
      kbId: KbService.resolveKbId(kbId),
      zip,
      owner: user.id,
      ...(tags ? { tags } : {}),
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
      tags: req.tags,
    })
    return c.json({ doc })
  }

  // ---------- 检索 ----------

  static async query(c: Context<AppEnv>, _user: AuthUser, req: KbQueryRequest) {
    const { query, kbId, ...opts } = req
    const result = await KbService.query(query, kbId, opts)
    return c.json({ result })
  }
}
