import { ConversationService } from '../service/conversation'

export function assertThreadOwnedByUser(userId: string, threadId: string): boolean {
  return ConversationService.ownedByUser(userId, threadId)
}
