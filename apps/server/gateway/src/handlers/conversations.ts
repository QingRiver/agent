import type { Context } from 'hono'
import type {
  ConversationIdRequest,
  CreateConversationRequest,
} from '../../shared/conversation'
import type { AppEnv, AuthUser } from '../types'
import { HTTPException } from 'hono/http-exception'
import { listGraphAgentCatalog } from '../agent/graphAgents'
import { getCheckpointer } from '../db/checkpointer'
import { ConversationService } from '../service/conversation'

export async function listConversationGraphs(c: Context<AppEnv>) {
  return c.json({ graphs: listGraphAgentCatalog() })
}

export async function listConversations(c: Context<AppEnv>, user: AuthUser) {
  const conversations = await ConversationService.list(user.id)
  return c.json({ conversations })
}

export async function createConversation(
  c: Context<AppEnv>,
  user: AuthUser,
  req: CreateConversationRequest,
) {
  const conversation = await ConversationService.create(user.id, req.agentId)
  return c.json({ conversation })
}

export async function conversationDetail(
  c: Context<AppEnv>,
  user: AuthUser,
  req: ConversationIdRequest,
) {
  const conversation = await ConversationService.get(user.id, req.id)
  if (!conversation)
    throw new HTTPException(404, { message: 'Not found' })
  return c.json({ conversation })
}

export async function setConversationPinned(
  c: Context<AppEnv>,
  user: AuthUser,
  req: ConversationIdRequest,
  pinned: boolean,
) {
  if (!(await ConversationService.setPinned(user.id, req.id, pinned)))
    throw new HTTPException(404, { message: 'Not found' })
  return c.json({ ok: true })
}

export async function deleteConversation(
  c: Context<AppEnv>,
  user: AuthUser,
  req: ConversationIdRequest,
) {
  if (!(await ConversationService.delete(user.id, req.id)))
    throw new HTTPException(404, { message: 'Not found' })
  await getCheckpointer().deleteThread(req.id)
  return c.json({ ok: true })
}

/** 清空当前用户全部对话及对应 checkpoint / interrupt。 */
export async function deleteAllConversations(c: Context<AppEnv>, user: AuthUser) {
  const ids = await ConversationService.deleteAll(user.id)
  const checkpointer = getCheckpointer()
  for (const id of ids)
    await checkpointer.deleteThread(id)
  return c.json({ ok: true, deleted: ids.length })
}
