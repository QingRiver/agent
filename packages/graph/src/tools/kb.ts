import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import { env } from '@agent/env'
import {
  formatChunksWithCitationHints,
  formatClarifyMarkdown,
  KB_NOT_FOUND_MESSAGE,
  searchKnowledgeBase,
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

/**
 * 知识库检索工具：内部走 `@agent/kb` 的 searchKnowledgeBase。
 * 返回文本含标准 MD 链接模板，供模型写进终答。
 */
export const kbSearchTool = tool(
  async ({ query }, config) => {
    const outcome = await searchKnowledgeBase(getKbId(config), query)

    if (outcome.kind === 'clarify')
      return formatClarifyMarkdown(outcome.message)
    if (outcome.kind === 'empty')
      return KB_NOT_FOUND_MESSAGE

    const body = `找到 ${outcome.chunks.length} 条相关片段：\n\n${formatChunksWithCitationHints(outcome.chunks, { style: 'tool' })}`
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
