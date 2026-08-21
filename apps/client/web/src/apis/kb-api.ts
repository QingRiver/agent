import type { InferRequestType, InferResponseType } from 'hono/client'
import { api, successData } from './api-client'

type Kb = typeof api.kb

export type KbDocsResponse = InferResponseType<Kb['documents']['list']['$post'], 200>
export type KbDocSummary = KbDocsResponse['docs'][number]

export type KbDocResponse = InferResponseType<Kb['documents'][':id']['get']['$post'], 200>
export type KbDoc = KbDocResponse['doc']

export type KbIngestResponse = InferResponseType<Kb['ingest']['files']['$post'], 200>
export type KbIngestResultItem = KbIngestResponse['items'][number]

export type KbQueryResponse = InferResponseType<Kb['query']['$post'], 200>
export type KbQueryResult = KbQueryResponse['result']
type KbQueryBody = InferRequestType<Kb['query']['$post']>['json']
export type KbQueryOptions = NonNullable<KbQueryBody['options']>

export class KbApi {
  // ---------- 文档 ----------

  static async listDocs(opts?: {
    dirId?: string
    includeDescendants?: boolean
    tagId?: string
  }) {
    const res = await api.kb.documents.list.$post({
      json: {
        ...(opts?.dirId != null ? { dirId: opts.dirId } : {}),
        ...(opts?.includeDescendants === true ? { includeDescendants: true } : {}),
        ...(opts?.tagId != null ? { tagId: opts.tagId } : {}),
      },
    })
    return (await successData(res)).docs
  }

  static async getDoc(id: string) {
    const res = await api.kb.documents[':id'].get.$post({ param: { id } })
    return (await successData(res)).doc
  }

  static async createDoc(
    body: {
      name: string
      content?: string
      tagIds?: string[]
      /** 挂载 dirs.id；null/缺省=Inbox */
      mountDirId?: string | null
    },
  ) {
    const res = await api.kb.documents.create.$post({
      json: {
        name: body.name,
        ...(body.mountDirId != null ? { mountDirId: body.mountDirId } : {}),
        ...(body.content != null ? { content: body.content } : {}),
        tagIds: body.tagIds ?? [],
      },
    })
    return (await successData(res)).doc
  }

  static async saveDraft(id: string, body: { content?: string, name?: string }) {
    const res = await api.kb.documents[':id']['save-draft'].$post({ param: { id }, json: body })
    return (await successData(res)).doc
  }

  static async updateMeta(
    id: string,
    body: {
      tagIds?: string[]
      /** 挂载 dirs.id；null=移到 Inbox。位置变 → 零重 embed，仅 setPayload 同步 id */
      mountDirId?: string | null
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

  // ---------- 引入 ----------

  /** 多文件上传（multipart）。tags 后端按逗号分隔字符串解析 */
  static async ingestFiles(
    files: File[],
    opts?: { mountDirId?: string, tags?: string[] },
  ) {
    // hono client 的 form 须为普通对象（会自行 new FormData）；传 FormData 实例时 Object.entries 为空
    const res = await api.kb.ingest.files.$post({
      form: {
        files,
        ...(opts?.mountDirId != null ? { mountDirId: opts.mountDirId } : {}),
        ...(opts?.tags?.length ? { tags: opts.tags.join(',') } : {}),
      },
    })
    return (await successData(res)).items
  }

  /** zip 压缩包上传（multipart），按包内目录结构还原成 dirs 子树（挂到 mountDirId 下） */
  static async ingestZip(file: File, opts?: { mountDirId?: string, tags?: string[] }) {
    const res = await api.kb.ingest.zip.$post({
      form: {
        file,
        ...(opts?.mountDirId != null ? { mountDirId: opts.mountDirId } : {}),
        ...(opts?.tags?.length ? { tags: opts.tags.join(',') } : {}),
      },
    })
    return (await successData(res)).items
  }

  static async ingestText(
    body: {
      content: string
      name: string
      mountDirId?: string | null
      tags?: string[]
    },
  ) {
    const res = await api.kb.ingest.text.$post({
      json: {
        content: body.content,
        name: body.name,
        ...(body.mountDirId != null ? { mountDirId: body.mountDirId } : {}),
        tags: body.tags ?? [],
      },
    })
    return (await successData(res)).doc
  }

  // ---------- 检索 ----------

  /** 对已提交 chunk 做 RAG 召回（与 kbGraph 同路径）。options 透传 retrieveAndRerank 检索选项 */
  static async query(query: string, options?: KbQueryOptions) {
    const res = await api.kb.query.$post({
      json: {
        query,
        ...(options != null ? { options } : {}),
      },
    })
    return (await successData(res)).result
  }
}
