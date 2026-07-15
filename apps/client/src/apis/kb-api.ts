import type { InferRequestType, InferResponseType } from 'hono/client'
import { api, successData } from './api-client'

/** 默认知识库 id（与后端 env.KB_COLLECTION 默认值一致）；多知识库时由调用方传入 */
export const KB_DEFAULT_ID = 'kb_default'

type Kb = typeof api.kb

export type KbNodesResponse = InferResponseType<Kb['nodes']['list']['$post'], 200>
export type KbNodeRow = KbNodesResponse['nodes'][number]

export type KbDocsResponse = InferResponseType<Kb['documents']['list']['$post'], 200>
export type KbDocSummary = KbDocsResponse['docs'][number]

export type KbDocResponse = InferResponseType<Kb['documents'][':id']['get']['$post'], 200>
export type KbDoc = KbDocResponse['doc']

export type KbTagsResponse = InferResponseType<Kb['tags']['list']['$post'], 200>
export type KbTagRow = KbTagsResponse['tags'][number]

export type KbIngestResponse = InferResponseType<Kb['ingest']['files']['$post'], 200>
export type KbIngestResultItem = KbIngestResponse['items'][number]

export type KbQueryResponse = InferResponseType<Kb['query']['$post'], 200>
export type KbQueryResult = KbQueryResponse['result']
type KbQueryBody = InferRequestType<Kb['query']['$post']>['json']
export type KbQueryOptions = NonNullable<KbQueryBody['options']>

export class KbApi {
  // ---------- 节点 ----------

  static async listNodes(kbId: string) {
    const res = await api.kb.nodes.list.$post({ json: { kbId } })
    return (await successData(res)).nodes
  }

  static async createNode(kbId: string, body: { name: string, parentId?: string | null }) {
    const res = await api.kb.nodes.create.$post({ json: { kbId, ...body } })
    return (await successData(res)).node
  }

  static async renameNode(id: string, name: string) {
    const res = await api.kb.nodes[':id'].rename.$post({ param: { id }, json: { name } })
    return (await successData(res)).node
  }

  static async moveNode(id: string, parentId: string) {
    const res = await api.kb.nodes[':id'].move.$post({ param: { id }, json: { parentId } })
    return (await successData(res)).node
  }

  static async moveNodeToRoot(id: string) {
    const res = await api.kb.nodes[':id']['move-to-root'].$post({ param: { id } })
    return (await successData(res)).node
  }

  static async deleteNode(id: string) {
    const res = await api.kb.nodes[':id'].delete.$post({ param: { id } })
    await successData(res)
  }

  // ---------- 文档 ----------

  static async listDocs(kbId: string) {
    const res = await api.kb.documents.list.$post({ json: { kbId } })
    return (await successData(res)).docs
  }

  static async getDoc(id: string) {
    const res = await api.kb.documents[':id'].get.$post({ param: { id } })
    return (await successData(res)).doc
  }

  static async createDoc(
    kbId: string,
    body: {
      name: string
      content?: string
      tags?: string[]
      parentNodeId?: string | null
    },
  ) {
    const res = await api.kb.documents.create.$post({ json: { kbId, ...body } })
    return (await successData(res)).doc
  }

  static async saveDraft(id: string, body: { content?: string, name?: string }) {
    const res = await api.kb.documents[':id']['save-draft'].$post({ param: { id }, json: body })
    return (await successData(res)).doc
  }

  static async updateMeta(
    id: string,
    body: {
      tags?: string[]
      parentNodeId?: string | null
      name?: string
      visibility?: string
      pinned?: boolean
    },
  ) {
    const res = await api.kb.documents[':id']['update-meta'].$post({ param: { id }, json: body })
    return (await successData(res)).doc
  }

  static async commit(id: string, skipEnrich = true) {
    const res = await api.kb.documents[':id'].commit.$post({ param: { id }, json: { skipEnrich } })
    return (await successData(res)).doc
  }

  static async batchCommit(ids: string[], skipEnrich = true) {
    const res = await api.kb.documents['batch-commit'].$post({ json: { ids, skipEnrich } })
    await successData(res)
  }

  static async deleteDoc(id: string) {
    const res = await api.kb.documents[':id'].delete.$post({ param: { id } })
    await successData(res)
  }

  // ---------- 标签 ----------

  static async listTags(kbId: string) {
    const res = await api.kb.tags.list.$post({ json: { kbId } })
    return (await successData(res)).tags
  }

  static async createTag(kbId: string, body: { name: string, color?: string }) {
    const res = await api.kb.tags.create.$post({ json: { kbId, ...body } })
    return (await successData(res)).tag
  }

  static async renameTag(id: string, name: string) {
    const res = await api.kb.tags[':id'].rename.$post({ param: { id }, json: { name } })
    return (await successData(res)).affectedDocs
  }

  static async deleteTag(id: string, dryRun = false) {
    const res = await api.kb.tags[':id'].delete.$post({ param: { id }, json: { dryRun } })
    return (await successData(res)).affectedDocs
  }

  static async updateTagColor(id: string, color: string | null) {
    const res = await api.kb.tags[':id']['update-color'].$post({ param: { id }, json: { color } })
    return (await successData(res)).tag
  }

  // ---------- 引入 ----------

  /** 多文件上传（multipart）。tags 后端按逗号分隔字符串解析 */
  static async ingestFiles(
    kbId: string,
    files: File[],
    opts?: { parentNodeId?: string, tags?: string[] },
  ) {
    const form = new FormData()
    for (const f of files)
      form.append('files', f)
    form.append('kbId', kbId)
    if (opts?.parentNodeId)
      form.append('parentNodeId', opts.parentNodeId)
    if (opts?.tags?.length)
      form.append('tags', opts.tags.join(','))
    const res = await api.kb.ingest.files.$post({ form })
    return (await successData(res)).items
  }

  /** zip 压缩包上传（multipart），按包内目录结构还原成文件夹树 */
  static async ingestZip(kbId: string, file: File, opts?: { tags?: string[] }) {
    const form = new FormData()
    form.append('file', file)
    form.append('kbId', kbId)
    if (opts?.tags?.length)
      form.append('tags', opts.tags.join(','))
    const res = await api.kb.ingest.zip.$post({ form })
    return (await successData(res)).items
  }

  static async ingestText(
    kbId: string,
    body: {
      content: string
      name: string
      parentNodeId?: string | null
      tags?: string[]
    },
  ) {
    const res = await api.kb.ingest.text.$post({ json: { kbId, ...body } })
    return (await successData(res)).doc
  }

  // ---------- 检索 ----------

  /** 对已提交 chunk 做 RAG 召回（与 kbGraph 同路径）。options 透传 retrieveAndRerank 检索选项 */
  static async query(kbId: string, query: string, options?: KbQueryOptions) {
    const res = await api.kb.query.$post({
      json: {
        kbId,
        query,
        ...(options != null ? { options } : {}),
      },
    })
    return (await successData(res)).result
  }
}
