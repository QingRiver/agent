import type { KbCitation, RetrievedChunk } from '../types'

export type { KbCitation } from '../types'

/** 正文引用编号：`[n]` / `[^n]`（校验与后处理用） */
const CITATION_REF_RE = /\[\^?(\d+)\]/g
/** 尚未带链接的引用：`[n]` / `[^n]`，且后面不是 `(` */
const CITATION_TO_LINK_RE = /\[\^?(\d+)\](?!\()/g

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

function parseCitationIndices(answer: string): number[] {
  const indices = new Set<number>()
  for (const match of answer.matchAll(CITATION_REF_RE)) {
    const rawIndex = match[1]
    if (!rawIndex)
      continue
    const index = Number.parseInt(rawIndex, 10)
    if (Number.isFinite(index))
      indices.add(index)
  }
  return [...indices].sort((a, b) => a - b)
}

/** KB 引文深链：优先 path=vdir，无 vdir 时回退 doc= */
export function kbCitationHref(citation: KbCitation): string {
  const q = new URLSearchParams()
  if (citation.vdir) {
    q.set('path', citation.vdir)
  }
  else {
    q.set('doc', citation.source_doc_id)
  }
  q.set('chunk', citation.chunk_id)
  if (citation.page_number != null)
    q.set('p', String(citation.page_number))
  return `/kb?${q.toString()}`
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
      ...(chunk.vdir !== undefined ? { vdir: chunk.vdir } : {}),
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
        '请仅基于给定 context 重答；引用须写成片段给出的 Markdown 链接，如 `[n](/kb?path=…&chunk=…)`。',
      ].join('\n'),
    }
  }

  return { ok: true, citations, invalidIndices: [] }
}

/**
 * 将正文 `[n]` / `[^n]` 转为 Markdown 链接 `[n](/kb?path=…&chunk=…)`（无 vdir 时为 doc=）。
 * 已是 `[n](...)` 的不再改写；不在文末追加脚注定义。
 */
export function answerWithMarkdownLinks(
  answer: string,
  citations: KbCitation[],
): string {
  if (!citations.length)
    return answer

  const byIndex = new Map(citations.map(c => [c.index, c]))
  return answer.replace(CITATION_TO_LINK_RE, (full, raw: string) => {
    const index = Number.parseInt(raw, 10)
    const citation = byIndex.get(index)
    if (!citation)
      return full
    return `[${raw}](${kbCitationHref(citation)})`
  })
}

/** 检索澄清：纯文本 message → 可渲染的 Markdown */
export function formatClarifyMarkdown(message: string): string {
  const body = message.trim() || '当前问题不够具体，请补充关键信息后重试。'
  return [
    '### 需要澄清',
    '',
    body,
    '',
    '> 请补充更具体的信息（对象、时间范围、文档名等）后再问。',
    '',
  ].join('\n')
}

function extractQuotedExcerpt(answer: string, index: number): string {
  const pattern = new RegExp(`[「"']([^」"']+)[」"']\\s*\\[\\^?${index}\\]`)
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
