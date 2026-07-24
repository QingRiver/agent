import type { KbStateType } from '../../state/kbState'
import { rewriteQuery } from '@agent/kb'
import { lastUserMessage } from './lastUserMessage'

export async function kbRewriteNode(state: KbStateType) {
  const userQuery = lastUserMessage(state.messages)
  const rewrittenQueries = await rewriteQuery(userQuery)
  return {
    rewrittenQueries,
    routeRejected: false,
    citationRetries: 0,
    retrievedChunks: [],
    citations: [],
  }
}
