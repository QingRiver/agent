import type { KbDocumentMeta } from '../types'
import process from 'node:process'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { z } from 'zod'
import { messageContentToString, parseLlmJson } from '../utils/llmJson'

const EnrichSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
  toc: z.array(z.string()),
  faq: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
})

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0,
})

export interface EnrichDocumentInput {
  source_doc_id: string
  filename: string
  content_hash: string
  markdown: string
  tags?: string[]
  vdir?: string
  owner?: string
}

export async function enrichDocument(input: EnrichDocumentInput): Promise<KbDocumentMeta> {
  const preview = input.markdown.slice(0, 12000)

  const response = await llm.invoke([
    new SystemMessage([
      '你是知识库文档预处理助手。',
      '根据文档内容生成：语义摘要、关键词（5-10个）、目录条目、FAQ（0-3组）。',
      '仅输出 JSON：{"summary":"...","keywords":["..."],"toc":["..."],"faq":[{"question":"...","answer":"..."}]}',
    ].join('\n')),
    new HumanMessage([
      `文件名：${input.filename}`,
      '文档内容：',
      preview,
    ].join('\n')),
  ])

  const enriched = parseLlmJson(messageContentToString(response.content), EnrichSchema)

  return {
    source_doc_id: input.source_doc_id,
    filename: input.filename,
    content_hash: input.content_hash,
    tags: input.tags ?? [],
    vdir: input.vdir,
    owner: input.owner,
    summary: enriched?.summary ?? '',
    keywords: enriched?.keywords ?? [],
    toc: enriched?.toc ?? [],
    faq: enriched?.faq ?? [],
  }
}
