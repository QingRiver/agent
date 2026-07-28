import type { RetrievedChunk } from '../types'
import { describe, expect, it } from 'vitest'
import {
  answerWithMarkdownLinks,
  buildContextFromChunks,
  formatClarifyMarkdown,
  kbCitationHref,
  validateCitations,
} from './citation'
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
    expect(result.correctionPrompt).toContain('Markdown 链接')
  })

  it('builds numbered context', () => {
    const context = buildContextFromChunks(sampleChunks)
    expect(context).toContain('[1]')
    expect(context).toContain('SKU-9001')
  })

  it('answerWithMarkdownLinks converts [n] to markdown links', () => {
    const answer = '旗舰产品编号为 SKU-9001 [1]。'
    const { citations } = validateCitations(answer, sampleChunks)
    const md = answerWithMarkdownLinks(answer, citations)
    expect(md).toContain('[1](/kb?doc=a&chunk=a%231)')
    expect(md).not.toContain('[^1]')
    expect(md).not.toMatch(/\[\^1\]:/)
  })

  it('answerWithMarkdownLinks skips already-linked [n](...)', () => {
    const linked = '见 [1](/kb?doc=a&chunk=a%231) 与裸引用 [2]。'
    const { citations } = validateCitations('见 [1] 与裸引用 [2]。', sampleChunks)
    const md = answerWithMarkdownLinks(linked, citations)
    expect(md).toBe('见 [1](/kb?doc=a&chunk=a%231) 与裸引用 [2](/kb?doc=b&chunk=b%231)。')
  })

  it('kbCitationHref encodes doc/chunk query', () => {
    expect(kbCitationHref({
      index: 1,
      chunk_id: 'c/1',
      source_doc_id: 'doc',
      heading_path: [],
      excerpt: 'x',
      page_number: 3,
    })).toBe('/kb?doc=doc&chunk=c%2F1&p=3')
  })

  it('formatClarifyMarkdown wraps message', () => {
    const md = formatClarifyMarkdown('请说明要查哪家子公司。')
    expect(md).toContain('### 需要澄清')
    expect(md).toContain('请说明要查哪家子公司。')
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
