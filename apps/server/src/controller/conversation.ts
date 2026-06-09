import type { Context } from 'hono'
import type {
  ConversationIdRequest,
  CreateConversationRequest,
} from '../../shared/conversation'
import type { AppEnv, AuthUser } from '../types'
import {
  ConversationDetailResponseSchema,
  ConversationIdRequestSchema,
  ConversationListResponseSchema,
  ConversationMessagesResponseSchema,
  ConversationMutationResponseSchema,
  CreateConversationRequestSchema,
  CreateConversationResponseSchema,
} from '../../shared/conversation'
import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversationMessages,
  listConversations,
  setConversationPinned,
} from '../conversation/repository'
import { hydrateThreadState } from '../conversation/threadState'
import { getAuthCheckpointer } from '../graphs/checkpointer'
import { AuthRequired, Controller, Get, Post, RequestSchema } from '../router/decorator'

@Controller('/conversations')
@AuthRequired()
export class ConversationController {
  @Get('/list')
  list(c: Context<AppEnv>, user: AuthUser): Response {
    const body = ConversationListResponseSchema.parse({
      conversations: listConversations(user.id),
    })
    return c.json(body)
  }

  @Post('/create')
  @RequestSchema(CreateConversationRequestSchema, 'body')
  create(c: Context<AppEnv>, user: AuthUser, req: CreateConversationRequest): Response {
    const body = CreateConversationResponseSchema.parse({
      conversation: createConversation(user.id, req.agentId),
    })
    return c.json(body)
  }

  @Get('/detail')
  @RequestSchema(ConversationIdRequestSchema, 'query')
  detail(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest): Response {
    const conversation = getConversation(user.id, req.id)
    if (!conversation)
      return c.json({ error: 'Not found' }, 404)

    const body = ConversationDetailResponseSchema.parse({ conversation })
    return c.json(body)
  }

  @Get('/messages')
  @RequestSchema(ConversationIdRequestSchema, 'query')
  async messages(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest): Promise<Response> {
    const conversation = getConversation(user.id, req.id)
    if (!conversation)
      return c.json({ error: 'Not found' }, 404)

    const body = ConversationMessagesResponseSchema.parse({
      messages: getConversationMessages(user.id, req.id),
      threadState: await hydrateThreadState(conversation.agentId, req.id),
    })
    return c.json(body)
  }

  @Post('/pin')
  @RequestSchema(ConversationIdRequestSchema, 'body')
  pin(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest): Response {
    if (!setConversationPinned(user.id, req.id, true))
      return c.json({ error: 'Not found' }, 404)

    return c.json(ConversationMutationResponseSchema.parse({ ok: true }))
  }

  @Post('/unpin')
  @RequestSchema(ConversationIdRequestSchema, 'body')
  unpin(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest): Response {
    if (!setConversationPinned(user.id, req.id, false))
      return c.json({ error: 'Not found' }, 404)

    return c.json(ConversationMutationResponseSchema.parse({ ok: true }))
  }

  @Post('/delete')
  @RequestSchema(ConversationIdRequestSchema, 'body')
  async remove(c: Context<AppEnv>, user: AuthUser, req: ConversationIdRequest): Promise<Response> {
    if (!deleteConversation(user.id, req.id))
      return c.json({ error: 'Not found' }, 404)

    await getAuthCheckpointer().deleteThread(req.id)
    return c.json(ConversationMutationResponseSchema.parse({ ok: true }))
  }
}
