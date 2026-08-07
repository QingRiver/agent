import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { KbStateType } from '../../state/kbState'
import process from 'node:process'
import {
  answerWithMarkdownLinks,
  buildContextFromChunks,
  kbCitationHref,
  validateCitations,
} from '@agent/kb'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { MAX_CITATION_RETRIES } from '../../state/kbState'
import { getAIMessageContent } from '../../utils'
import { lastHumanMessageText } from '../../utils/messageText'

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0.2,
})

function buildGenerateSystemPrompt(context: string): string {
  return [
    '你是企业知识库问答助手。仅根据下方检索片段回答用户问题。',
    '回答中对关键事实使用标准 Markdown 链接引用，格式为片段给出的 `[n](/kb?path=…&chunk=…)`；不要只用裸 `[n]`。',
    '不要编造检索片段中不存在的信息。',
    '',
    '检索片段：',
    context,
  ].join('\n')
}

/** 与 reactAgent 工具侧一致：上下文里带上可粘贴的 MD 链接 */
function buildLinkedContext(state: KbStateType): string {
  return state.retrievedChunks
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
      const heading = c.heading_path.length ? c.heading_path.join(' > ') : '正文'
      return `[${index}] (${heading}) 引用请写 \`${`[${index}](${href})`}\`\n${c.raw_text}`
    })
    .join('\n\n')
}

/** 生成答案；流式输出标准 Markdown；若仍残留裸 [n] 则在落盘时补链接 */
export async function kbGenerateNode(
  state: KbStateType,
  config: LangGraphRunnableConfig,
) {
  const userQuery = lastHumanMessageText(state.messages)
  const context = state.retrievedChunks.length
    ? buildLinkedContext(state)
    : buildContextFromChunks(state.retrievedChunks)
  const correction = state.citationRetries > 0
    ? state.messages.at(-1)?.content
    : undefined

  const messages = [
    new SystemMessage(buildGenerateSystemPrompt(context)),
    new HumanMessage(userQuery),
  ]
  if (typeof correction === 'string' && correction.trim())
    messages.push(new HumanMessage(correction))

  const response = await llm.invoke(messages, config)
  const answer = getAIMessageContent(response as AIMessage)
  const validation = validateCitations(answer, state.retrievedChunks)

  if (!validation.ok && state.citationRetries < MAX_CITATION_RETRIES) {
    return {
      messages: [new HumanMessage(validation.correctionPrompt ?? '请修正引用后重答。')],
      citationRetries: state.citationRetries + 1,
    }
  }

  if (!validation.ok) {
    return {
      messages: [new AIMessage('抱歉，无法生成通过引文校验的答案，请换个问法重试。')],
    }
  }

  // 流式已发出模型原文；落盘时把残留裸 [n] 收成链接（不改 AG-UI 已发出的 delta）
  const markdown = answerWithMarkdownLinks(answer, validation.citations)
  const messageId = (response as AIMessage).id
  return {
    messages: [new AIMessage({
      content: markdown,
      ...(messageId != null ? { id: messageId } : {}),
    })],
  }
}
