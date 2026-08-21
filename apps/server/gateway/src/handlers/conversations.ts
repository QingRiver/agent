import type { Context } from 'hono'
import type {
  ConversationIdRequest,
  CreateConversationRequest,
} from '../../shared/conversation'
import type { AppEnv, AuthUser } from '../types'
import { listGraphAgentCatalog } from '../agent/graphAgents'
import { hydrateThreadBundle } from '../conversation/threadHydrate'
import { getCheckpointer } from '../db/checkpointer'
import { ConversationService } from '../service/conversation'

export class ConversationHandlers {
  static graphs(c: Context<AppEnv>) {
    return c.json({ graphs: listGraphAgentCatalog() })
  }

  static async list(c: Context<AppEnv>, user: AuthUser) {
    const conversations = await ConversationService.list(user.id)
    return c.json({ conversations })
  }

  static async create(c: Context<AppEnv>, user: AuthUser, req: CreateConversationRequest) {
    const conversation = await ConversationService.create(user.id, req.agentId)
    return c.json({ conversation })
  }

  static async detail(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest) {
    const conversation = await ConversationService.get(user.id, req.id)
    if (!conversation)
      return c.json({ error: 'Not found' }, 404)

    return c.json({ conversation })
  }

  static async messages(
    c: Context<AppEnv>,
    user: AuthUser,
    req: ConversationIdRequest,
  ) {
    const conversation = await ConversationService.get(user.id, req.id)
    if (!conversation)
      return c.json({ error: 'Not found' }, 404)

    const bundle = await hydrateThreadBundle(conversation.agentId, req.id)
    return c.json({
      messages: bundle.messages,
      threadState: bundle.threadState,
    })
  }

  static async pin(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest) {
    if (!(await ConversationService.setPinned(user.id, req.id, true)))
      return c.json({ error: 'Not found' }, 404)

    return c.json({ ok: true })
  }

  static async unpin(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest) {
    if (!(await ConversationService.setPinned(user.id, req.id, false)))
      return c.json({ error: 'Not found' }, 404)

    return c.json({ ok: true })
  }

  static async remove(
    c: Context<AppEnv>,
    user: AuthUser,
    req: ConversationIdRequest,
  ) {
    if (!(await ConversationService.delete(user.id, req.id)))
      return c.json({ error: 'Not found' }, 404)

    await getCheckpointer().deleteThread(req.id)
    return c.json({ ok: true })
  }
}
