import type { RetrievedChunk } from '../types'

export interface SparseSearchOptions {
  kbId: string
  query: string
  limit: number
}

export interface SparseProvider {
  search: (options: SparseSearchOptions) => Promise<RetrievedChunk[]>
}
