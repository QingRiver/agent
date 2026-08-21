import { ConversationService } from '../service/conversation'

export async function assertThreadOwnedByUser(userId: string, threadId: string): Promise<boolean> {
  return ConversationService.ownedByUser(userId, threadId)
}
