import type { AppEnv } from '../types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  KbBatchCommitSchema,
  KbCommitSchema,
  KbCreateDocSchema,
  KbCreateNodeSchema,
  KbDocIdParamSchema,
  KbDocPatchSchema,
  KbIngestPathRequestSchema,
  KbIngestTextSchema,
  KbListDocsQuerySchema,
  KbNodeIdParamSchema,
  KbQueryRequestSchema,
  KbUpdateNodeSchema,
} from '../../shared/kb'
import { KbHandlers } from '../handlers/kb'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

export const kbRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)

  // ---------- 文件夹节点 ----------
  .get('/nodes', c => KbHandlers.listNodes(c, c.get('user')!, c.req.query('kbId')))
  .post('/nodes', zValidator('json', KbCreateNodeSchema), c => KbHandlers.createNode(c, c.get('user')!, c.req.valid('json')))
  .patch(
    '/nodes/:id',
    zValidator('param', KbNodeIdParamSchema),
    zValidator('json', KbUpdateNodeSchema),
    c => KbHandlers.updateNode(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .delete(
    '/nodes/:id',
    zValidator('param', KbNodeIdParamSchema),
    c => KbHandlers.deleteNode(c, c.get('user')!, c.req.valid('param').id),
  )

  // ---------- 文档草稿 ----------
  .get('/documents', zValidator('query', KbListDocsQuerySchema), c => KbHandlers.listDocs(c, c.get('user')!, c.req.valid('query')))
  .get('/documents/:id', zValidator('param', KbDocIdParamSchema), c => KbHandlers.getDoc(c, c.get('user')!, c.req.valid('param').id))
  .post('/documents', zValidator('json', KbCreateDocSchema), c => KbHandlers.createDoc(c, c.get('user')!, c.req.valid('json')))
  .patch(
    '/documents/:id',
    zValidator('param', KbDocIdParamSchema),
    zValidator('json', KbDocPatchSchema),
    c => KbHandlers.patchDoc(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/documents/:id/commit',
    zValidator('param', KbDocIdParamSchema),
    zValidator('json', KbCommitSchema.optional().default({})),
    c => KbHandlers.commit(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post('/documents/batch-commit', zValidator('json', KbBatchCommitSchema), c => KbHandlers.batchCommit(c, c.get('user')!, c.req.valid('json')))
  .delete(
    '/documents/:id',
    zValidator('param', KbDocIdParamSchema),
    c => KbHandlers.deleteDoc(c, c.get('user')!, c.req.valid('param').id),
  )
  .get('/tags', c => KbHandlers.listTags(c, c.get('user')!, c.req.query('kbId')))

  // ---------- 引入（markitdown → 草稿） ----------
  .post('/ingest', c => KbHandlers.ingest(c, c.get('user')!))
  .post('/ingest/path', zValidator('json', KbIngestPathRequestSchema), c => KbHandlers.ingestPath(c, c.get('user')!, c.req.valid('json')))
  .post('/ingest/text', zValidator('json', KbIngestTextSchema), c => KbHandlers.ingestText(c, c.get('user')!, c.req.valid('json')))

  // ---------- 检索（兼容） ----------
  .post('/query', zValidator('json', KbQueryRequestSchema), c => KbHandlers.query(c, c.get('user')!, c.req.valid('json')))
  .get('/manage', c => KbHandlers.manage(c, c.get('user')!))
