import type { RetrievedChunk } from '@agent/kb'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { env } from '@agent/env'
import { retrieveAndRerank, rewriteQuery } from '@agent/kb'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export const KB_SEARCH_TOOL_NAME = 'kb_search'

/** 从运行时 configurable 取知识库 id，不暴露给 LLM；缺省回落到全局默认集合 */
function getKbId(config: LangGraphRunnableConfig): string {
  const configurable = config?.configurable as { kbId?: string } | undefined
  return configurable?.kbId ?? env.KB_COLLECTION
}

/** 把结构化片段渲染成带引用编号的上下文文本，供 LLM 直接引用 */
function formatChunks(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (doc=${c.source_doc_id} chunk=${c.chunk_id})\n${c.raw_text}`)
    .join('\n\n---\n\n')
}

/**
 * 知识库检索工具：内部封装 query 改写 → 混合召回 → rerank → 兜底(clarify/retry_wider)。
 * 对调用方完全透明，返回带引用编号的上下文文本（或澄清/未命中提示），由 LLM 决定下一步。
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

      // clarify：召回质量不足以作答，把澄清建议作为工具结果回传，由 LLM 决定
      if (result.fallback?.decision === 'clarify')
        return result.fallback.message

      // retry_wider：召回过窄，扩大 recallK 再试一次并去重
      if (result.fallback?.decision === 'retry_wider') {
        const wider = await retrieveAndRerank(kbId, q, {
          skipRerank: false,
          recallK: env.KB_RECALL_K * 2,
        })
        for (const c of wider.chunks)
          chunkMap.set(`${c.source_doc_id}:${c.chunk_id}`, c)
      }

      for (const c of result.chunks)
        chunkMap.set(`${c.source_doc_id}:${c.chunk_id}`, c)

      if (chunkMap.size)
        break
    }

    if (!chunkMap.size)
      return '知识库中未找到相关内容。若尚未导入文档，请先通过 /kb/ingest 导入后再试。'

    return `找到 ${chunkMap.size} 条相关片段：\n\n${formatChunks([...chunkMap.values()])}`
  },
  {
    name: KB_SEARCH_TOOL_NAME,
    description:
      '在知识库中检索与用户问题相关的文档片段（内部含 query 改写、混合召回、rerank）。'
      + '当需要回答涉及已导入知识库内容的问题时调用。返回带引用编号的上下文片段，请在回答中引用对应编号。',
    schema: z.object({
      query: z.string().describe('用于检索的自然语言问题或关键词'),
    }),
  },
)

export const KB_TOOLS = [kbSearchTool]
