import type { AgentId } from './api-types'
import { api, successData } from './api-client'

export class Conversation {
  static async list() {
    const res = await api.conversations.list.$get()
    const data = await successData(res)
    return data.conversations
  }

  static async create(agentId: AgentId) {
    const res = await api.conversations.create.$post({ json: { agentId } })
    const data = await successData(res)
    return data.conversation
  }

  static async detail(id: string) {
    const res = await api.conversations.detail.$get({ query: { id } })
    const data = await successData(res)
    return data.conversation
  }

  static async messages(id: string) {
    const res = await api.conversations.messages.$get({ query: { id } })
    return await successData(res)
  }

  static async pin(id: string) {
    await api.conversations.pin.$post({ json: { id } })
  }

  static async unpin(id: string) {
    await api.conversations.unpin.$post({ json: { id } })
  }

  static async delete(id: string) {
    await api.conversations.delete.$post({ json: { id } })
  }
}
