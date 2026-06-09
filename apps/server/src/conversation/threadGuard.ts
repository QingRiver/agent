import { conversationOwnedByUser } from './repository'

export function assertThreadOwnedByUser(userId: string, threadId: string): boolean {
  return conversationOwnedByUser(userId, threadId)
}
