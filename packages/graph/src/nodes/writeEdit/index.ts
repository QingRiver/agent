import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { EditorFocus, WriteEditInput } from './types'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { readEditorPath } from '../../edges/routeByEditorPath'
import { buildWriteSystemPrompt } from '../../prompts/editorPrompts'
import { createChatModel } from '../../utils/chatModel'
import { lastHumanMessageText, messageText } from '../../utils/messageText'
import { readFocuses, readOptionalString, resolveEditCase } from './config'
import { runDocumentEdit } from './documentEdit'

export { readFocuses, readOptionalString, resolveEditCase } from './config'
export { summarizeHunks } from './summarizeHunks'
export type { EditorFocus, WriteEditInput } from './types'

/** ⌘K inline：旁路作业，关 thinking */
const inlineLlm = createChatModel({ temperature: 0.7, thinking: 'disabled' })

function focusTexts(focuses: EditorFocus[] | undefined): string[] {
  return (focuses ?? []).map(f => f.text.trim()).filter(Boolean)
}

/** 统一 writeEdit：inline 只吐选区；document 走补丁工具 + CUSTOM summaries */
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

  if (input.editCase === 'document') {
    const baseline = input.documentBaseline?.trim() ?? ''
    if (!baseline)
      return { messages: [new AIMessage('缺少文稿基线，无法生成修改。请刷新页面后重试。')], polished: '' }
    return runDocumentEdit(input, config, system, baseline)
  }

  const humanContent = input.humanContent?.trim() ?? ''
  if (!humanContent)
    return { messages: [new AIMessage('缺少选区上下文，无法改写。')], polished: '' }

  const response = await inlineLlm.invoke([
    new SystemMessage(system),
    new HumanMessage(humanContent),
  ])
  const polished = messageText(response).trim()
  return { messages: [response], polished }
}

async function writeEditNode(
  state: { messages: BaseMessage[] },
  config: LangGraphRunnableConfig,
): Promise<{ messages: BaseMessage[] }> {
  const editorPath = readEditorPath(config)
  // chat Write 强制 document；job 按 state/configurable（inline | document）
  const editCase = editorPath === 'chat' ? 'document' : resolveEditCase(config)
  const humanContent = lastHumanMessageText(state.messages)
  const focuses = readFocuses(config)
  const instructionFromConfig = readOptionalString(config, 'polishInstruction')
  const instruction = instructionFromConfig || (editCase === 'document' ? humanContent : '')
  const baselineFromConfig = readOptionalString(config, 'documentBaseline')
  // chat：基线只信 documentBaseline（user 文是指令）；job document：可回退到 user 全文
  const baseline = baselineFromConfig
    || (editCase === 'document' && editorPath === 'job' ? humanContent : '')

  const input: WriteEditInput = {
    editCase,
    reasoning: editorPath === 'chat',
  }
  if (editCase === 'document') {
    if (baselineFromConfig || baseline)
      input.documentBaseline = baselineFromConfig || baseline
    if (instruction)
      input.polishInstruction = instruction
  }
  else {
    if (baselineFromConfig)
      input.documentBaseline = baselineFromConfig
    if (instructionFromConfig)
      input.polishInstruction = instructionFromConfig
    if (humanContent)
      input.humanContent = humanContent
  }
  if (focuses.length)
    input.focuses = focuses

  const { messages } = await runWriteEdit(input, config)
  return { messages }
}

/** editor 图 writeEdit 节点 */
export function makeWriteEditNode() {
  return async (
    state: { messages: BaseMessage[] },
    config: LangGraphRunnableConfig,
  ): Promise<{ messages: BaseMessage[] }> => writeEditNode(state, config)
}
