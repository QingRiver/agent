import { z } from 'zod'

export const KbChunkSchema = z.object({
  chunk_id: z.string(),
  source_doc_id: z.string(),
  page_number: z.number().int().optional(),
  heading_path: z.array(z.string()),
  raw_text: z.string(),
  /** 文档虚拟路径（Qdrant payload / 引文深链） */
  vdir: z.string().optional(),
})

export type KbChunk = z.infer<typeof KbChunkSchema>

export const KbDocumentMetaSchema = z.object({
  source_doc_id: z.string(),
  filename: z.string(),
  content_hash: z.string(),
  tags: z.array(z.string()).default([]),
  vdir: z.string().optional(),
  owner: z.string().optional(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  toc: z.array(z.string()).default([]),
  faq: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).default([]),
})

export type KbDocumentMeta = z.infer<typeof KbDocumentMetaSchema>

export interface RetrievedChunk extends KbChunk {
  score: number
  rank?: number
  rerank_score?: number
}

/** 校验通过的引文中间结构，仅用于拼 Markdown 链接（不进协议 / 不进 graph state） */
export interface KbCitation {
  index: number
  chunk_id: string
  source_doc_id: string
  page_number?: number
  heading_path: string[]
  excerpt: string
  /** 有则深链用 path=；否则回退 doc= */
  vdir?: string
}
