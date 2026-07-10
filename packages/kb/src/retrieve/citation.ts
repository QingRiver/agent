import type { KbCitation, RetrievedChunk } from '../types'

const CITATION_TAG_RE = /\[(\d+)\]/g

export interface CitationValidationResult {
  ok: boolean
  citations: KbCitation[]
  invalidIndices: number[]
  correctionPrompt?: string
}

export function buildContextFromChunks(chunks: RetrievedChunk[]): string {
  return chunks
    .map((chunk, index) => {
      const heading = chunk.heading_path.length
        ? chunk.heading_path.join(' > ')
        : '正文'
      return `[${index + 1}] (${heading})\n${chunk.raw_text}`
    })
    .join('\n\n')
}

export function parseCitationIndices(answer: string): number[] {
  const indices = new Set<number>()
  for (const match of answer.matchAll(CITATION_TAG_RE)) {
    const rawIndex = match[1]
    if (!rawIndex)
      continue
    const index = Number.parseInt(rawIndex, 10)
    if (Number.isFinite(index))
      indices.add(index)
  }
  return [...indices].sort((a, b) => a - b)
}

export function validateCitations(
  answer: string,
  chunks: RetrievedChunk[],
): CitationValidationResult {
  const indices = parseCitationIndices(answer)
  const citations: KbCitation[] = []
  const invalidIndices: number[] = []

  for (const index of indices) {
    const chunk = chunks[index - 1]
    if (!chunk) {
      invalidIndices.push(index)
      continue
    }

    const excerpt = extractQuotedExcerpt(answer, index)
    if (excerpt && !isExcerptInChunk(excerpt, chunk.raw_text)) {
      invalidIndices.push(index)
      continue
    }

    citations.push({
      index,
      chunk_id: chunk.chunk_id,
      source_doc_id: chunk.source_doc_id,
      heading_path: chunk.heading_path,
      excerpt: excerpt || chunk.raw_text.slice(0, 200),
      ...(chunk.page_number !== undefined ? { page_number: chunk.page_number } : {}),
    })
  }

  if (invalidIndices.length) {
    return {
      ok: false,
      citations,
      invalidIndices,
      correctionPrompt: [
        '你上一版答案中的引用编号无效或与检索片段不符。',
        `无效引用：${invalidIndices.map(i => `[${i}]`).join(', ')}`,
        '请仅基于给定 context 重答，引用必须使用 [n] 格式且内容必须来自对应片段。',
      ].join('\n'),
    }
  }

  return { ok: true, citations, invalidIndices: [] }
}

function extractQuotedExcerpt(answer: string, index: number): string {
  const pattern = new RegExp(`[「"']([^」"']+)[」"']\\s*\\[${index}\\]`)
  const match = pattern.exec(answer)
  return match?.[1]?.trim() ?? ''
}

function isExcerptInChunk(excerpt: string, chunkText: string): boolean {
  const normalizedExcerpt = normalizeForMatch(excerpt)
  const normalizedChunk = normalizeForMatch(chunkText)
  if (!normalizedExcerpt)
    return true
  return normalizedChunk.includes(normalizedExcerpt)
}

function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

export function citationsToPayload(citations: KbCitation[]): KbCitation[] {
  return citations
}
