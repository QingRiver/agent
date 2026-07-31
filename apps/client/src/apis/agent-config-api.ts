import { api, successData } from './api-client'

export class AgentConfigApi {
  static async upsert(body: {
    id?: string
    name: string
    description?: string
    userPrompt: string
    kbId: string
    maxSteps: number
  }) {
    return successData(await api['agent-configs'].upsert.$post({ json: body }))
  }

  static async get(id: string) {
    return successData(await api['agent-configs'].get.$get({ query: { id } }))
  }
}
