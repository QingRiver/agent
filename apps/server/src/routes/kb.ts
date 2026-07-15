import type { AppEnv } from '../types'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import {
  KbBatchCommitSchema,
  KbCommitSchema,
  KbCreateDocSchema,
  KbCreateNodeSchema,
  KbDocIdParamSchema,
  KbDraftUpdateSchema,
  KbIngestPathRequestSchema,
  KbIngestTextSchema,
  KbListDocsRequestSchema,
  KbListNodesRequestSchema,
  KbListTagsRequestSchema,
  KbMetaUpdateSchema,
  KbMoveNodeSchema,
  KbNodeIdParamSchema,
  KbQueryRequestSchema,
  KbRenameNodeSchema,
} from '../../shared/kb'
import { KbHandlers } from '../handlers/kb'
import { handleAppError } from '../http/errors'
import { requireAuth } from '../middleware/authMiddleware'

export const kbRoutes = new Hono<AppEnv>()
  .onError(handleAppError)
  .use('*', requireAuth)

  // ---------- 文件夹节点 ----------
  .post('/nodes/list', zValidator('json', KbListNodesRequestSchema), c => KbHandlers.listNodes(c, c.get('user')!, c.req.valid('json')))
  .post('/nodes/create', zValidator('json', KbCreateNodeSchema), c => KbHandlers.createNode(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/nodes/:id/rename',
    zValidator('param', KbNodeIdParamSchema),
    zValidator('json', KbRenameNodeSchema),
    c => KbHandlers.renameNode(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/nodes/:id/move',
    zValidator('param', KbNodeIdParamSchema),
    zValidator('json', KbMoveNodeSchema),
    c => KbHandlers.moveNode(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/nodes/:id/move-to-root',
    zValidator('param', KbNodeIdParamSchema),
    c => KbHandlers.moveNodeToRoot(c, c.get('user')!, c.req.valid('param').id),
  )
  .post(
    '/nodes/:id/delete',
    zValidator('param', KbNodeIdParamSchema),
    c => KbHandlers.deleteNode(c, c.get('user')!, c.req.valid('param').id),
  )

  // ---------- 文档草稿 ----------
  .post('/documents/list', zValidator('json', KbListDocsRequestSchema), c => KbHandlers.listDocs(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/documents/:id/get',
    zValidator('param', KbDocIdParamSchema),
    c => KbHandlers.getDoc(c, c.get('user')!, c.req.valid('param').id),
  )
  .post('/documents/create', zValidator('json', KbCreateDocSchema), c => KbHandlers.createDoc(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/documents/:id/save-draft',
    zValidator('param', KbDocIdParamSchema),
    zValidator('json', KbDraftUpdateSchema),
    c => KbHandlers.patchDraft(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/documents/:id/update-meta',
    zValidator('param', KbDocIdParamSchema),
    zValidator('json', KbMetaUpdateSchema),
    c => KbHandlers.patchMeta(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post(
    '/documents/:id/commit',
    zValidator('param', KbDocIdParamSchema),
    zValidator('json', KbCommitSchema.optional().default({})),
    c => KbHandlers.commit(c, c.get('user')!, c.req.valid('param').id, c.req.valid('json')),
  )
  .post('/documents/batch-commit', zValidator('json', KbBatchCommitSchema), c => KbHandlers.batchCommit(c, c.get('user')!, c.req.valid('json')))
  .post(
    '/documents/:id/delete',
    zValidator('param', KbDocIdParamSchema),
    c => KbHandlers.deleteDoc(c, c.get('user')!, c.req.valid('param').id),
  )
  .post('/tags/list', zValidator('json', KbListTagsRequestSchema), c => KbHandlers.listTags(c, c.get('user')!, c.req.valid('json')))

  // ---------- 引入（markitdown → 草稿） ----------
  .post('/ingest/files', c => KbHandlers.ingest(c, c.get('user')!))
  .post('/ingest/path', zValidator('json', KbIngestPathRequestSchema), c => KbHandlers.ingestPath(c, c.get('user')!, c.req.valid('json')))
  .post('/ingest/text', zValidator('json', KbIngestTextSchema), c => KbHandlers.ingestText(c, c.get('user')!, c.req.valid('json')))

  // ---------- 检索 ----------
  .post('/query', zValidator('json', KbQueryRequestSchema), c => KbHandlers.query(c, c.get('user')!, c.req.valid('json')))
