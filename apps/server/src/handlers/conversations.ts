import type { Context } from 'hono'
import type {
  ConversationIdRequest,
  CreateConversationRequest,
} from '../../shared/conversation'
import type { AppEnv, AuthUser } from '../types'
import { hydrateThreadBundle } from '../conversation/threadHydrate'
import { getAuthCheckpointer } from '../db/checkpointer'
import { ConversationService } from '../service/conversation'

export class ConversationHandlers {
  static list(c: Context<AppEnv>, user: AuthUser) {
    return c.json({ conversations: ConversationService.list(user.id) })
  }

  static create(c: Context<AppEnv>, user: AuthUser, req: CreateConversationRequest) {
    return c.json({ conversation: ConversationService.create(user.id, req.agentId) })
  }

  static detail(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest) {
    const conversation = ConversationService.get(user.id, req.id)
    if (!conversation)
      return c.json({ error: 'Not found' }, 404)

    return c.json({ conversation })
  }

  static async messages(
    c: Context<AppEnv>,
    user: AuthUser,
    req: ConversationIdRequest,
  ) {
    const conversation = ConversationService.get(user.id, req.id)
    if (!conversation)
      return c.json({ error: 'Not found' }, 404)

    const bundle = await hydrateThreadBundle(conversation.agentId, req.id)
    return c.json({
      messages: bundle.messages,
      threadState: bundle.threadState,
    })
  }

  static pin(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest) {
    if (!ConversationService.setPinned(user.id, req.id, true))
      return c.json({ error: 'Not found' }, 404)

    return c.json({ ok: true })
  }

  static unpin(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest) {
    if (!ConversationService.setPinned(user.id, req.id, false))
      return c.json({ error: 'Not found' }, 404)

    return c.json({ ok: true })
  }

  static async remove(
    c: Context<AppEnv>,
    user: AuthUser,
    req: ConversationIdRequest,
  ) {
    if (!ConversationService.delete(user.id, req.id))
      return c.json({ error: 'Not found' }, 404)

    await getAuthCheckpointer().deleteThread(req.id)
    return c.json({ ok: true })
  }
}
