import type { InferResponseType } from 'hono/client'
import { api, successData } from './api-client'

type Kb = typeof api.kb

export type KbNodesResponse = InferResponseType<Kb['nodes']['$get'], 200>
export type KbNodeRow = KbNodesResponse['nodes'][number]

export type KbDocsResponse = InferResponseType<Kb['documents']['$get'], 200>
export type KbDocSummary = KbDocsResponse['docs'][number]

export type KbDocResponse = InferResponseType<Kb['documents'][':id']['$get'], 200>
export type KbDoc = KbDocResponse['doc']

export type KbTagsResponse = InferResponseType<Kb['tags']['$get'], 200>

export type KbQueryResponse = InferResponseType<Kb['query']['$post'], 200>
export type KbQueryResult = KbQueryResponse['result']

export class KbApi {
  static async listNodes(kbId?: string) {
    const res = await api.kb.nodes.$get({
      ...(kbId != null ? { query: { kbId } } : { query: {} }),
    })
    return (await successData(res)).nodes
  }

  static async listDocs(kbId?: string) {
    const res = await api.kb.documents.$get({
      ...(kbId != null ? { query: { kbId } } : { query: {} }),
    })
    return (await successData(res)).docs
  }

  static async listTags(kbId?: string) {
    const res = await api.kb.tags.$get({
      ...(kbId != null ? { query: { kbId } } : { query: {} }),
    })
    return (await successData(res)).tags
  }

  static async getDoc(id: string) {
    const res = await api.kb.documents[':id'].$get({ param: { id } })
    return (await successData(res)).doc
  }

  static async createDoc(body: { name: string, content?: string, kbId?: string, tags?: string[] }) {
    const res = await api.kb.documents.$post({ json: body })
    return (await successData(res)).doc
  }

  static async patchDoc(id: string, body: Record<string, unknown>) {
    const res = await api.kb.documents[':id'].$patch({
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
    const res = await api.kb.documents[':id'].$delete({ param: { id } })
    await successData(res)
  }

  /** 对已提交 chunk 做 RAG 召回（与 kbGraph 同路径） */
  static async query(query: string, kbId?: string) {
    const res = await api.kb.query.$post({
      json: {
        query,
        ...(kbId != null ? { kbId } : {}),
      },
    })
    return (await successData(res)).result
  }
}
