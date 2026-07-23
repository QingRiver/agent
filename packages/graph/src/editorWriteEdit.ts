import type { EditorEditCase, WriterChangeSummary } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import process from 'node:process'
import { computeHunks, WRITER_CHANGE_SUMMARIES_EVENT, WriterHunkSummariesSchema } from '@agent/protocol'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import {
  buildWriteSystemPrompt,
  DOCUMENT_ASSISTANT_NOTE,
  DOCUMENT_WRITING_NOTE,
  SUMMARY_SYSTEM_PROMPT,
} from './prompts/editorPrompts'
import { writeAguiAssistantText } from './stream/writeAguiAssistantText'
import { parseLlmJson } from './utils/parseLlmJson'
import { silentChatCompletion } from './utils/silentChatCompletion'
import { streamDocumentCompletion } from './utils/streamDocumentCompletion'

export interface EditorFocus {
  text: string
  from?: number
  to?: number
}

export interface WriteEditInput {
  editCase: EditorEditCase
  /** document：纯全文基线；inline：可选 */
  documentBaseline?: string
  polishInstruction?: string
  focuses?: EditorFocus[]
  /** inline 时通常为带 <focus> 的全文 */
  humanContent?: string
}

/** ⌘K / document 改稿：LangChain 默认流式 → AG-UI 文本与 reasoning */
const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0.7,
})

export function messageText(message: BaseMessage | undefined): string {
  if (!message)
    return ''
  const { content } = message
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string')
        return part
      if (part && typeof part === 'object' && 'text' in part) {
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? text : ''
      }
      return ''
    }).join('')
  }
  return ''
}

/** 明显的改稿意图（避免 reasoning 模型 content 为空时误判为 ask） */
export function heuristicEditorIntent(text: string): 'ask' | 'write' | null {
  const t = text.trim()
  if (!t)
    return null
  if (/润色|改写|扩写|缩写|展开说明|展开一下|续写|纠错|改成|改为|生成修改|更正式|更口语|精简|压缩/.test(t))
    return 'write'
  if (/什么意思|为什么|优缺点|怎么看|解释一下|是什么|如何理解|有何建议/.test(t))
    return 'ask'
  return null
}

export async function summarizeHunks(original: string, polished: string): Promise<WriterChangeSummary[]> {
  const hunks = computeHunks(original, polished).filter(h => h.originalText || h.newText)
  if (!hunks.length)
    return []
  const payload = hunks.map((h, i) => ({
    index: i,
    originalText: h.originalText || '(纯插入)',
    newText: h.newText || '(纯删除)',
  }))
  const raw = await silentChatCompletion({
    system: SUMMARY_SYSTEM_PROMPT,
    user: JSON.stringify(payload, null, 2),
    temperature: 0,
  })
  const parsed = parseLlmJson(raw, WriterHunkSummariesSchema)
  const summaries = parsed?.summaries ?? []
  return hunks.map((h, i) => ({
    hintFrom: h.from,
    originalText: h.originalText,
    newText: h.newText,
    summary: summaries[i]?.trim() ?? '',
  }))
}

function focusTexts(focuses: EditorFocus[] | undefined): string[] {
  return (focuses ?? []).map(f => f.text.trim()).filter(Boolean)
}

/** 统一 writeEdit：inline 只吐选区；document 吐全文 + CUSTOM summaries */
export async function runWriteEdit(
  input: WriteEditInput,
  config: LangGraphRunnableConfig,
): Promise<{ messages: BaseMessage[], polished: string }> {
  const instruction = input.polishInstruction?.trim() ?? ''
  const focuses = input.focuses ?? []
  const texts = focusTexts(focuses)

  const system = buildWriteSystemPrompt({
    editCase: input.editCase,
    instruction,
    focusTexts: texts,
  })

  let humanContent = input.humanContent?.trim() ?? ''
  if (input.editCase === 'document') {
    const baseline = input.documentBaseline?.trim() ?? ''
    if (!baseline)
      return { messages: [new AIMessage('缺少文稿基线，无法生成修改。请刷新页面后重试。')], polished: '' }
    humanContent = baseline
  }
  else if (!humanContent) {
    return { messages: [new AIMessage('缺少选区上下文，无法改写。')], polished: '' }
  }

  if (input.editCase === 'inline') {
    const response = await llm.invoke([
      new SystemMessage(system),
      new HumanMessage(humanContent),
    ])
    const polished = messageText(response).trim()
    return { messages: [response], polished }
  }

  // document：聊天先出「编写中…」；正文静默累积（不发 TEXT_MESSAGE）；reasoning 单独推 AG-UI
  writeAguiAssistantText(config, DOCUMENT_WRITING_NOTE)
  const polished = await streamDocumentCompletion(config, {
    system,
    user: humanContent,
    temperature: 0.7,
  })

  const baseline = input.documentBaseline!.trim()
  if (baseline && polished) {
    const changes = await summarizeHunks(baseline, polished)
    config.writer?.({
      name: WRITER_CHANGE_SUMMARIES_EVENT,
      payload: {
        changes,
        polished,
        baseline,
      } satisfies {
        changes: WriterChangeSummary[]
        polished: string
        baseline: string
      },
    })
  }

  const note = polished
    ? DOCUMENT_ASSISTANT_NOTE
    : '未能生成有效改稿，请换一种说法再试。'
  return { messages: [new AIMessage(note)], polished }
}

export function resolveEditCase(config: LangGraphRunnableConfig): EditorEditCase {
  const raw = config.configurable?.editCase
  if (raw === 'inline' || raw === 'document')
    return raw
  const writerMode = config.configurable?.writerMode
  return writerMode === 'inline' ? 'inline' : 'document'
}

export function readFocuses(config: LangGraphRunnableConfig): EditorFocus[] {
  const raw = config.configurable?.focuses
  if (!Array.isArray(raw))
    return []
  const out: EditorFocus[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object')
      continue
    const rec = item as Record<string, unknown>
    const text = typeof rec.text === 'string' ? rec.text : ''
    if (!text.trim())
      continue
    const focus: EditorFocus = { text }
    if (typeof rec.from === 'number')
      focus.from = rec.from
    if (typeof rec.to === 'number')
      focus.to = rec.to
    out.push(focus)
  }
  return out
}

export function readOptionalString(config: LangGraphRunnableConfig, key: string): string {
  const v = config.configurable?.[key]
  return typeof v === 'string' ? v : ''
}
