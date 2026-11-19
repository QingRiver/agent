import type { Context } from 'hono'
import type { UpsertAgentConfigRequest } from '../../shared/agentConfig'
import type { AppEnv } from '../types'
import { HTTPException } from 'hono/http-exception'
import { toAgentConfigDto } from '../../shared/agentConfig'
import { loadAgentConfig, upsertAgentConfig } from '../agent/agentConfig/store'

interface AuthUser { id: string }

export async function upsertAgentConfigHandler(
  c: Context<AppEnv>,
  user: AuthUser,
  body: UpsertAgentConfigRequest,
) {
  const record = await upsertAgentConfig(user.id, body)
  return c.json(toAgentConfigDto(record))
}

export async function getAgentConfigHandler(
  c: Context<AppEnv>,
  user: AuthUser,
  query: { id: string },
) {
  const record = await loadAgentConfig(user.id, query.id)
  if (!record)
    throw new HTTPException(404, { message: 'not_found' })
  return c.json(toAgentConfigDto(record))
}
