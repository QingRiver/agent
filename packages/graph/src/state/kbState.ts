import type { RetrievedChunk } from '@agent/kb'
import { Annotation, MessagesAnnotation } from '@langchain/langgraph'
import { lastValue } from './lastValue'

export const KbState = Annotation.Root({
  ...MessagesAnnotation.spec,
  rewrittenQueries: lastValue<string[]>(() => []),
  retrievedChunks: lastValue<RetrievedChunk[]>(() => []),
  citationRetries: lastValue<number>(() => 0),
})

export type KbStateType = typeof KbState.State

export const MAX_CITATION_RETRIES = 2
