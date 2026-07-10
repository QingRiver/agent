import type { Buffer } from 'node:buffer'
import type { IngestResult } from '../types'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { embedTexts } from '../embedding'
import {
  deleteByDocId,
  getStoredContentHash,
  upsertChunks,
} from '../qdrant'
import { chunkMarkdown, deriveSourceDocId, deriveStableDocId, hashContent } from './chunker'
import { cleanMarkdown } from './cleaner'
import { enrichDocument } from './enricher'
import { loadDocumentMarkdown } from './markitdown'

export interface IngestDocumentInput {
  buffer: Buffer
  filename: string
  kbId: string
  tags?: string[]
  vdir?: string
  owner?: string
  skipEnrich?: boolean
}

const SUPPORTED_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.docx',
  '.pdf',
  '.html',
  '.htm',
  '.txt',
])

export async function ingestDocument(input: IngestDocumentInput): Promise<IngestResult> {
  const markdown = await loadDocumentMarkdown(input.buffer, input.filename)
  const stableDocId = deriveStableDocId(input.filename)
  const cleaned = cleanMarkdown(markdown, {
    sourceDocId: stableDocId,
    ...(input.vdir ? { baseUrl: input.vdir } : {}),
  })
  const contentHash = hashContent(cleaned)
  const sourceDocId = deriveSourceDocId(input.filename, contentHash)

  const storedHash = await getStoredContentHash(input.kbId, sourceDocId)
  if (storedHash === contentHash) {
    return {
      source_doc_id: sourceDocId,
      skipped: true,
      chunks_written: 0,
      content_hash: contentHash,
    }
  }

  if (storedHash)
    await deleteByDocId(input.kbId, sourceDocId)

  const chunks = chunkMarkdown(cleaned, { sourceDocId })
  const docMeta = input.skipEnrich
    ? {
        source_doc_id: sourceDocId,
        filename: input.filename,
        content_hash: contentHash,
        tags: input.tags ?? [],
        vdir: input.vdir,
        owner: input.owner,
        keywords: [],
        toc: [],
        faq: [],
      }
    : await enrichDocument({
        source_doc_id: sourceDocId,
        filename: input.filename,
        content_hash: contentHash,
        markdown: cleaned,
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.vdir ? { vdir: input.vdir } : {}),
        ...(input.owner ? { owner: input.owner } : {}),
      })

  const vectors = await embedTexts(chunks.map(chunk => chunk.raw_text))
  await upsertChunks(
    input.kbId,
    chunks.map((chunk, index) => ({
      chunk,
      docMeta,
      denseVector: vectors[index] ?? [],
    })),
  )

  return {
    source_doc_id: sourceDocId,
    skipped: false,
    chunks_written: chunks.length,
    content_hash: contentHash,
  }
}

export async function ingestDirectory(
  dir: string,
  kbId: string,
  meta?: Pick<IngestDocumentInput, 'tags' | 'vdir' | 'owner' | 'skipEnrich'>,
): Promise<IngestResult[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: IngestResult[] = []

  for (const entry of entries) {
    if (!entry.isFile())
      continue

    const ext = path.extname(entry.name).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(ext))
      continue

    const filePath = path.join(dir, entry.name)
    const buffer = await readFile(filePath)
    results.push(await ingestDocument({
      buffer,
      filename: entry.name,
      kbId,
      ...meta,
    }))
  }

  return results
}
