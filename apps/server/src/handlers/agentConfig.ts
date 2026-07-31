import type { Context } from 'hono'
import type { UpsertAgentConfigRequest } from '../../shared/agentConfig'
import type { AppEnv } from '../types'
import { loadAgentConfig, upsertAgentConfig } from '../agent/agentConfig/store'

interface AuthUser { id: string }

export class AgentConfigHandlers {
  static async upsert(
    c: Context<AppEnv>,
    user: AuthUser,
    body: UpsertAgentConfigRequest,
  ) {
    const record = await upsertAgentConfig(user.id, body)
    return c.json({
      id: record.id,
      name: record.name,
      description: record.description,
      userPrompt: record.userPrompt,
      kbId: record.kbId,
      maxSteps: record.maxSteps,
      updatedAt: record.updatedAt,
    })
  }

  static async get(
    c: Context<AppEnv>,
    user: AuthUser,
    query: { id: string },
  ) {
    const record = await loadAgentConfig(user.id, query.id)
    if (!record)
      return c.json({ error: 'not_found' }, 404)
    return c.json({
      id: record.id,
      name: record.name,
      description: record.description,
      userPrompt: record.userPrompt,
      kbId: record.kbId,
      maxSteps: record.maxSteps,
      updatedAt: record.updatedAt,
    })
  }
}
