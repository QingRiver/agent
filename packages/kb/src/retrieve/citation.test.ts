import type { RetrievedChunk } from '../types'
import { describe, expect, it } from 'vitest'
import { buildContextFromChunks, validateCitations } from './citation'
import { rrfFusion } from './hybridRetriever'

const sampleChunks: RetrievedChunk[] = [
  {
    chunk_id: 'a#1',
    source_doc_id: 'a',
    heading_path: ['A'],
    raw_text: 'SKU-9001 是旗舰产品编号。',
    score: 0,
  },
  {
    chunk_id: 'b#1',
    source_doc_id: 'b',
    heading_path: ['B'],
    raw_text: '工号 E12345 负责财务审批。',
    score: 0,
  },
]

describe('citation', () => {
  it('accepts valid citations', () => {
    const answer = '旗舰产品编号为 SKU-9001 [1]。'
    const result = validateCitations(answer, sampleChunks)
    expect(result.ok).toBe(true)
    expect(result.citations).toHaveLength(1)
  })

  it('rejects hallucinated citation index', () => {
    const answer = '不存在的内容 [9]。'
    const result = validateCitations(answer, sampleChunks)
    expect(result.ok).toBe(false)
    expect(result.invalidIndices).toContain(9)
    expect(result.correctionPrompt).toContain('无效引用')
  })

  it('builds numbered context', () => {
    const context = buildContextFromChunks(sampleChunks)
    expect(context).toContain('[1]')
    expect(context).toContain('SKU-9001')
  })
})

describe('rrfFusion', () => {
  it('merges dense and sparse rankings', () => {
    const dense: RetrievedChunk[] = [
      { chunk_id: 'a#1', source_doc_id: 'a', heading_path: ['A'], raw_text: sampleChunks[0]!.raw_text, rank: 5, score: 0.9 },
      { chunk_id: 'b#1', source_doc_id: 'b', heading_path: ['B'], raw_text: sampleChunks[1]!.raw_text, rank: 2, score: 0.8 },
    ]
    const sparse: RetrievedChunk[] = [
      { chunk_id: 'b#1', source_doc_id: 'b', heading_path: ['B'], raw_text: sampleChunks[1]!.raw_text, rank: 1, score: 0.95 },
      { chunk_id: 'a#1', source_doc_id: 'a', heading_path: ['A'], raw_text: sampleChunks[0]!.raw_text, rank: 10, score: 0.7 },
    ]

    const fused = rrfFusion([dense, sparse], 2)
    expect(fused).toHaveLength(2)
    expect(fused[0]?.chunk_id).toBe('b#1')
  })
})
