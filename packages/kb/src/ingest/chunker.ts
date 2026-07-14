import type { KbChunk } from '../types'
import { createHash } from 'node:crypto'

export interface ChunkerOptions {
  sourceDocId: string
  maxChars?: number
  overlapChars?: number
}

interface Section {
  heading_path: string[]
  body: string
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

export function chunkMarkdown(
  markdown: string,
  options: ChunkerOptions,
): KbChunk[] {
  const maxChars = options.maxChars ?? 800
  const overlapChars = options.overlapChars ?? 120
  const sections = splitByHeadings(markdown)
  const chunks: KbChunk[] = []
  let chunkIndex = 0

  for (const section of sections) {
    const windows = slidingWindows(section.body, maxChars, overlapChars)
    for (const window of windows) {
      chunkIndex += 1
      chunks.push({
        chunk_id: `${options.sourceDocId}#${chunkIndex}`,
        source_doc_id: options.sourceDocId,
        heading_path: section.heading_path,
        raw_text: window.text,
        page_number: window.pageNumber,
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

interface WindowSlice {
  text: string
  pageNumber?: number
}

function toWindowSlice(text: string): WindowSlice {
  const pageNumber = extractPageNumber(text)
  if (pageNumber === undefined)
    return { text }
  return { text, pageNumber }
}

function slidingWindows(
  text: string,
  maxChars: number,
  overlapChars: number,
): WindowSlice[] {
  const normalized = text.trim()
  if (!normalized)
    return []

  if (normalized.length <= maxChars)
    return [toWindowSlice(normalized)]

  const slices: WindowSlice[] = []
  let start = 0

  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length)
    const slice = normalized.slice(start, end).trim()
    if (slice)
      slices.push(toWindowSlice(slice))

    if (end >= normalized.length)
      break
    start = Math.max(end - overlapChars, start + 1)
  }

  return slices
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
