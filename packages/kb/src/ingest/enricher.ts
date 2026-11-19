import type { KbDocumentMeta } from '../types'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createKbChatModel } from '../utils/chatCompletion'

const EnrichSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
  toc: z.array(z.string()),
  faq: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
})

const emptyEnrich = {
  summary: '',
  keywords: [] as string[],
  toc: [] as string[],
  faq: [] as Array<{ question: string, answer: string }>,
}

export interface EnrichDocumentInput {
  source_doc_id: string
  filename: string
  content_hash: string
  markdown: string
  tags?: string[]
  owner?: string
}

export async function enrichDocument(input: EnrichDocumentInput): Promise<KbDocumentMeta> {
  const preview = input.markdown.slice(0, 12000)
  let enriched = emptyEnrich
  try {
    enriched = await createKbChatModel({ thinking: 'disabled' })
      .withStructuredOutput(EnrichSchema)
      .invoke([
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
  }
  catch {
    // 结构化失败时用空字段，不阻断入库
  }

  return {
    source_doc_id: input.source_doc_id,
    filename: input.filename,
    content_hash: input.content_hash,
    tags: input.tags ?? [],
    owner: input.owner,
    summary: enriched.summary,
    keywords: enriched.keywords,
    toc: enriched.toc,
    faq: enriched.faq,
  }
}
