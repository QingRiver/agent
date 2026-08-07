import type { RetrievedChunk } from '@agent/kb'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { env } from '@agent/env'
import {
  formatClarifyMarkdown,
  kbCitationHref,
  retrieveAndRerank,
  rewriteQuery,
} from '@agent/kb'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export const KB_SEARCH_TOOL_NAME = 'kb_search'

/** 工具返回过长时截断，避免撑爆外层 ReAct 上下文 */
const KB_SEARCH_RESULT_MAX_CHARS = 12_000

/** 从运行时 configurable 取知识库 id，不暴露给 LLM；缺省回落到全局默认集合 */
function getKbId(config: LangGraphRunnableConfig): string {
  const configurable = config?.configurable as { kbId?: string } | undefined
  return configurable?.kbId ?? env.KB_COLLECTION
}

/** 片段上下文：给模型可粘贴的标准 MD 链接模板 */
function formatChunks(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => {
      const index = i + 1
      const href = kbCitationHref({
        index,
        chunk_id: c.chunk_id,
        source_doc_id: c.source_doc_id,
        heading_path: c.heading_path,
        excerpt: '',
        ...(c.page_number !== undefined ? { page_number: c.page_number } : {}),
      })
      const mdLink = `[${index}](${href})`
      return `[${index}] 引用请写 \`${mdLink}\`\n${c.raw_text}`
    })
    .join('\n\n---\n\n')
}

/**
 * 知识库检索工具：内部封装 query 改写 → 混合召回 → rerank → 兜底(clarify/retry_wider)。
 * 返回文本含标准 MD 链接模板，供模型写进终答。
 */
export const kbSearchTool = tool(
  async ({ query }, config) => {
    const kbId = getKbId(config)
    const queries = (await rewriteQuery(query)) ?? [query]
    const chunkMap = new Map<string, RetrievedChunk>()

    for (const q of queries) {
      const result = await retrieveAndRerank(kbId, q, {
        skipRerank: false,
        recallK: env.KB_RECALL_K,
      })

      if (result.fallback?.decision === 'clarify')
        return formatClarifyMarkdown(result.fallback.message)

      if (result.fallback?.decision === 'retry_wider') {
        const wider = await retrieveAndRerank(kbId, q, {
          skipRerank: false,
          recallK: env.KB_RECALL_K * 2,
        })
        for (const c of wider.chunks)
          chunkMap.set(`${c.source_doc_id}:${c.chunk_id}`, c)
        if (wider.fallback?.decision === 'clarify')
          return formatClarifyMarkdown(wider.fallback.message)
      }

      for (const c of result.chunks)
        chunkMap.set(`${c.source_doc_id}:${c.chunk_id}`, c)

      if (chunkMap.size)
        break
    }

    if (!chunkMap.size) {
      return '知识库中未找到相关内容。若尚未导入文档，请先通过 /kb/ingest 导入后再试。'
    }

    const chunks = [...chunkMap.values()]
    const body = `找到 ${chunks.length} 条相关片段：\n\n${formatChunks(chunks)}`
    return body.length <= KB_SEARCH_RESULT_MAX_CHARS
      ? body
      : `${body.slice(0, KB_SEARCH_RESULT_MAX_CHARS)}\n\n…(已截断)`
  },
  {
    name: KB_SEARCH_TOOL_NAME,
    description:
      '在知识库中检索与用户问题相关的文档片段（内部含 query 改写、混合召回、rerank）。'
      + '当需要回答涉及已导入知识库内容的问题时调用。'
      + '返回带编号的上下文；作答时在正文用工具给出的 Markdown 链接（如 [1](/kb?path=…&chunk=…)）标注来源。',
    schema: z.object({
      query: z.string().describe('用于检索的自然语言问题或关键词'),
    }),
  },
)

export const KB_TOOLS = [kbSearchTool]
