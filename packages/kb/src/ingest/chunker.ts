import type { KbChunk } from '../types'
import { createHash } from 'node:crypto'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

export interface ChunkerOptions {
  sourceDocId: string
  maxChars?: number
  overlapChars?: number
}

interface Section {
  heading_path: string[]
  body: string
}

/** 按 Unicode 码点计长，避免 emoji 等被当成两个「字」 */
function codePointLength(text: string): number {
  return [...text].length
}

/**
 * 优先在段落 / 中英文句读处切开；最后才落到字符级。
 * keepSeparator 交给 splitter 默认（true）。
 */
function createSectionSplitter(
  chunkSize: number,
  chunkOverlap: number,
): RecursiveCharacterTextSplitter {
  return new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    lengthFunction: codePointLength,
    separators: [
      '\n\n',
      '\n',
      '。',
      '！',
      '？',
      '；',
      '，',
      '. ',
      '! ',
      '? ',
      '; ',
      ', ',
      ' ',
      '',
    ],
  })
}

function parseHeading(line: string): { level: number, title: string } | null {
  if (!line.startsWith('#'))
    return null

  let level = 0
  while (level < line.length && line[level] === '#')
    level += 1

  if (level === 0 || level > 6 || line[level] !== ' ')
    return null

  const title = line.slice(level + 1).trim()
  return title ? { level, title } : null
}

/**
 * 先按 Markdown 标题分段（保留 heading_path），段内用 RecursiveCharacterTextSplitter 切窗。
 */
export async function chunkMarkdown(
  markdown: string,
  options: ChunkerOptions,
): Promise<KbChunk[]> {
  const maxChars = options.maxChars ?? 800
  const overlapChars = options.overlapChars ?? 120
  const splitter = createSectionSplitter(maxChars, overlapChars)
  const sections = splitByHeadings(markdown)
  const chunks: KbChunk[] = []
  let chunkIndex = 0

  for (const section of sections) {
    const parts = await splitter.splitText(section.body)
    for (const text of parts) {
      const trimmed = text.trim()
      if (!trimmed)
        continue
      chunkIndex += 1
      const pageNumber = extractPageNumber(trimmed)
      chunks.push({
        chunk_id: `${options.sourceDocId}#${chunkIndex}`,
        source_doc_id: options.sourceDocId,
        heading_path: section.heading_path,
        raw_text: trimmed,
        ...(pageNumber !== undefined ? { page_number: pageNumber } : {}),
      })
    }
  }

  if (!chunks.length && markdown.trim()) {
    chunks.push({
      chunk_id: `${options.sourceDocId}#1`,
      source_doc_id: options.sourceDocId,
      heading_path: [],
      raw_text: markdown.trim(),
    })
  }

  return chunks
}

function splitByHeadings(markdown: string): Section[] {
  const lines = markdown.split('\n')
  const sections: Section[] = []
  const headingStack: string[] = []
  let currentBody: string[] = []

  const flush = () => {
    const body = currentBody.join('\n').trim()
    if (body)
      sections.push({ heading_path: [...headingStack], body })
    currentBody = []
  }

  for (const line of lines) {
    const heading = parseHeading(line)
    if (heading) {
      flush()
      headingStack.splice(heading.level - 1)
      headingStack[heading.level - 1] = heading.title
      continue
    }
    currentBody.push(line)
  }

  flush()

  if (!sections.length && markdown.trim())
    sections.push({ heading_path: [], body: markdown.trim() })

  return sections
}

function extractPageNumber(text: string): number | undefined {
  const match = /(?:^|\n)<!--\s*page:(\d+)\s*-->/i.exec(text)
    ?? /(?:^|\n)Page\s+(\d+)/i.exec(text)
  if (!match?.[1])
    return undefined
  const page = Number.parseInt(match[1], 10)
  return Number.isFinite(page) ? page : undefined
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}
