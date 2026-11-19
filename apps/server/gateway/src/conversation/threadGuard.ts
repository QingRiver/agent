import { HTTPException } from 'hono/http-exception'
import { ConversationService } from '../service/conversation'

/** 线程必须属于当前用户；否则 403 */
export async function requireThreadOwned(userId: string, threadId: string): Promise<void> {
  if (!(await ConversationService.ownedByUser(userId, threadId)))
    throw new HTTPException(403, { message: 'Forbidden: thread not owned by user' })
}
