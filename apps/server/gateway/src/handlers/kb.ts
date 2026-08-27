import type { Context } from 'hono'
import type {
  KbBatchCommit,
  KbCommit,
  KbCreate,
  KbCreateDoc,
  KbDraftUpdate,
  KbIngestText,
  KbListDocsRequest,
  KbMetaUpdate,
  KbQueryRequest,
} from '../../shared/kb'
import type { AppEnv, AuthUser } from '../types'
import { Buffer } from 'node:buffer'
import { HTTPException } from 'hono/http-exception'
import { notFound, requireOwned } from '../http/errors'
import { KbService } from '../service/kb'

export class KbHandlers {
  static async listKbs(c: Context<AppEnv>, user: AuthUser) {
    const kbs = await KbService.listBindings(user.id)
    return c.json({ kbs })
  }

  static async markKb(c: Context<AppEnv>, user: AuthUser, req: KbCreate) {
    const kb = await KbService.mark(user.id, req.dirId)
    return c.json({ kb })
  }

  static async unmarkKb(c: Context<AppEnv>, user: AuthUser, dirId: string) {
    await KbService.unmark(user.id, dirId)
    return c.json({ ok: true })
  }

  // ---------- 文档草稿 ----------

  static async listDocs(c: Context<AppEnv>, user: AuthUser, q: KbListDocsRequest) {
    // 默认只看自己的；显式 owner 也只能等于当前用户
    const owner = q.owner != null && q.owner === user.id ? q.owner : user.id
    const docs = await KbService.listDocs({
      userId: user.id,
      owner,
      ...(q.dirId != null ? { dirId: q.dirId } : {}),
      ...(q.includeDescendants === true ? { includeDescendants: true } : {}),
      ...(q.tagId != null ? { tagId: q.tagId } : {}),
    })
    return c.json({ docs })
  }

  static async getDoc(c: Context<AppEnv>, user: AuthUser, id: string) {
    const doc = requireOwned(await KbService.getDoc(id), user.id)
    return c.json({ doc })
  }

  static async createDoc(c: Context<AppEnv>, user: AuthUser, req: KbCreateDoc) {
    const doc = await KbService.createDraft({
      userId: user.id,
      mountDirId: req.mountDirId,
      ...(req.kbId != null ? { kbId: req.kbId } : {}),
      name: req.name,
      ...(req.content != null ? { content: req.content } : {}),
      owner: user.id,
      tagIds: req.tagIds,
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

  // ---------- 引入（markitdown → 草稿） ----------

  static async ingest(c: Context<AppEnv>, user: AuthUser) {
    const body = await c.req.parseBody({ all: true })
    const rawFiles = body.files
    const files = (Array.isArray(rawFiles) ? rawFiles : [rawFiles]).filter(
      (f): f is File => f instanceof File,
    )
    if (!files.length)
      throw new HTTPException(400, { message: 'files is required' })

    const tags = typeof body.tags === 'string'
      ? body.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined
    const mountDirId = typeof body.mountDirId === 'string' ? body.mountDirId : undefined
    if (!mountDirId)
      throw new HTTPException(400, { message: 'mountDirId is required' })

    const fileData = await Promise.all(files.map(async f => ({
      buffer: Buffer.from(await f.arrayBuffer()),
      filename: f.name,
    })))

    const items = await KbService.ingestFiles({
      userId: user.id,
      files: fileData,
      mountDirId,
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

    const tags = typeof body.tags === 'string'
      ? body.tags.split(',').map(t => t.trim()).filter(Boolean)
      : undefined
    const mountDirId = typeof body.mountDirId === 'string' ? body.mountDirId : undefined
    if (!mountDirId)
      throw new HTTPException(400, { message: 'mountDirId is required' })

    const zip = Buffer.from(await file.arrayBuffer())
    const items = await KbService.ingestFromZip({
      userId: user.id,
      zip,
      mountDirId,
      owner: user.id,
      ...(tags ? { tags } : {}),
    })
    return c.json({ items })
  }

  static async ingestText(c: Context<AppEnv>, user: AuthUser, req: KbIngestText) {
    const doc = await KbService.ingestText({
      userId: user.id,
      content: req.content,
      name: req.name,
      mountDirId: req.mountDirId,
      owner: user.id,
      tags: req.tags,
    })
    return c.json({ doc })
  }

  // ---------- 检索 ----------

  static async query(c: Context<AppEnv>, _user: AuthUser, req: KbQueryRequest) {
    const { query, ...opts } = req
    const result = await KbService.query(query, opts.kbId, opts)
    return c.json({ result })
  }
}
