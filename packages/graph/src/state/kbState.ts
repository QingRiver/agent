import type { RetrievedChunk } from '@agent/kb'
import type { KbCitation } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import { Annotation } from '@langchain/langgraph'

export const KbState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  rewrittenQueries: Annotation<string[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
  retrievedChunks: Annotation<RetrievedChunk[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
  citations: Annotation<KbCitation[]>({
    reducer: (_x, y) => y,
    default: () => [],
  }),
  routeRejected: Annotation<boolean>({
    reducer: (_x, y) => y,
    default: () => false,
  }),
  citationRetries: Annotation<number>({
    reducer: (_x, y) => y,
    default: () => 0,
  }),
})

export type KbStateType = typeof KbState.State

export const MAX_CITATION_RETRIES = 2
