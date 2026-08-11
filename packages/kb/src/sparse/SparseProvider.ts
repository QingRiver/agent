import type { KbRecallFilter } from '../qdrant'
import type { RetrievedChunk } from '../types'

export interface SparseSearchOptions {
  kbId: string
  query: string
  limit: number
  /** Qdrant filter（召回作用域）；骨架，待接作用域构造 */
  filter?: KbRecallFilter
}

export interface SparseProvider {
  search: (options: SparseSearchOptions) => Promise<RetrievedChunk[]>
}
