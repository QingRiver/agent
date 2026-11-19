import type { KbStateType } from '../../state/kbState'
import { rewriteQuery } from '@agent/kb'
import { lastHumanMessageText } from '../../utils/messageText'

export async function kbRewriteNode(state: KbStateType) {
  const userQuery = lastHumanMessageText(state.messages)
  const rewrittenQueries = await rewriteQuery(userQuery)
  return {
    rewrittenQueries,
    citationRetries: 0,
    retrievedChunks: [],
  }
}
