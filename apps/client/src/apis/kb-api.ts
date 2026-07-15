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

export type KbQueryResponse = InferResponseType<Kb['query']['$post'], 200>
export type KbQueryResult = KbQueryResponse['result']
type KbQueryBody = InferRequestType<Kb['query']['$post']>['json']
export type KbQueryOptions = NonNullable<KbQueryBody['options']>

export class KbApi {
  static async listNodes(kbId: string) {
    const res = await api.kb.nodes.list.$post({ json: { kbId } })
    return (await successData(res)).nodes
  }

  static async listDocs(kbId: string) {
    const res = await api.kb.documents.list.$post({ json: { kbId } })
    return (await successData(res)).docs
  }

  static async listTags(kbId: string) {
    const res = await api.kb.tags.list.$post({ json: { kbId } })
    return (await successData(res)).tags
  }

  static async getDoc(id: string) {
    const res = await api.kb.documents[':id'].get.$post({ param: { id } })
    return (await successData(res)).doc
  }

  static async createDoc(kbId: string, body: { name: string, content?: string, tags?: string[] }) {
    const res = await api.kb.documents.create.$post({ json: { kbId, ...body } })
    return (await successData(res)).doc
  }

  static async saveDraft(id: string, body: { content?: string, name?: string }) {
    const res = await api.kb.documents[':id']['save-draft'].$post({
      param: { id },
      json: body,
    })
    return (await successData(res)).doc
  }

  static async updateMeta(id: string, body: { tags?: string[], parentNodeId?: string | null, name?: string, visibility?: string, pinned?: boolean }) {
    const res = await api.kb.documents[':id']['update-meta'].$post({
      param: { id },
      json: body,
    })
    return (await successData(res)).doc
  }

  static async commit(id: string, skipEnrich = true) {
    const res = await api.kb.documents[':id'].commit.$post({
      param: { id },
      json: { skipEnrich },
    })
    return (await successData(res)).doc
  }

  static async deleteDoc(id: string) {
    const res = await api.kb.documents[':id'].delete.$post({ param: { id } })
    await successData(res)
  }

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
