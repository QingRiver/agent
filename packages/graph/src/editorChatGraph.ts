import type { EditorChatIntent } from '@agent/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { WriteEditInput } from './editorWriteEdit'
import process from 'node:process'
import { EditorChatIntentSchema } from '@agent/protocol'
import { SystemMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import {
  heuristicEditorIntent,
  messageText,
  readFocuses,
  readOptionalString,
  runWriteEdit,
} from './editorWriteEdit'
import { ASK_SYSTEM_PROMPT, CLASSIFY_INTENT_SYSTEM_PROMPT } from './prompts/editorPrompts'
import { parseLlmJson } from './utils/parseLlmJson'
import { silentChatCompletion } from './utils/silentChatCompletion'

const EditorChatState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  intent: Annotation<EditorChatIntent | null>({
    reducer: (_x, y) => y,
    default: () => null,
  }),
})

/** Ask 路径：默认流式，回答进聊天 */
const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL ?? '',
  temperature: 0.7,
})

function forceIntent(config: LangGraphRunnableConfig): EditorChatIntent | null {
  const raw = config.configurable?.forceIntent
  return raw === 'ask' || raw === 'write' ? raw : null
}

async function classifyIntent(
  state: typeof EditorChatState.State,
  config: LangGraphRunnableConfig,
) {
  const forced = forceIntent(config)
  if (forced)
    return { intent: forced }

  const latestUser = [...state.messages].reverse().find(m => m.getType() === 'human')
  const text = messageText(latestUser)
  if (!text.trim())
    return { intent: 'ask' as const }

  const byHeuristic = heuristicEditorIntent(text)
  if (byHeuristic)
    return { intent: byHeuristic }

  // 静默分类，避免 {"intent":...} 进聊天气泡
  const raw = await silentChatCompletion({
    system: CLASSIFY_INTENT_SYSTEM_PROMPT,
    user: text,
    temperature: 0,
  })
  const parsed = parseLlmJson(raw, EditorChatIntentSchema)
  return { intent: parsed?.intent ?? 'ask' }
}

async function chatbot(state: typeof EditorChatState.State) {
  const messages = state.messages[0]?.type === 'system'
    ? state.messages
    : [new SystemMessage(ASK_SYSTEM_PROMPT), ...state.messages]
  const response = await llm.invoke(messages)
  return { messages: [response] }
}

async function writeEdit(
  state: typeof EditorChatState.State,
  config: LangGraphRunnableConfig,
) {
  const latestUser = [...state.messages].reverse().find(m => m.getType() === 'human')
  const userText = messageText(latestUser)
  const baseline = readOptionalString(config, 'documentBaseline')
  const instruction = readOptionalString(config, 'polishInstruction') || userText
  const focuses = readFocuses(config)

  const input: WriteEditInput = {
    editCase: 'document',
    polishInstruction: instruction,
  }
  if (baseline)
    input.documentBaseline = baseline
  if (focuses.length)
    input.focuses = focuses

  const { messages } = await runWriteEdit(input, config)

  return { messages }
}

function routeByIntent(state: typeof EditorChatState.State): 'chatbot' | 'writeEdit' {
  return state.intent === 'write' ? 'writeEdit' : 'chatbot'
}

export const editorChatGraph = new StateGraph(EditorChatState)
  .addNode('classifyIntent', classifyIntent)
  .addNode('chatbot', chatbot)
  .addNode('writeEdit', writeEdit)
  .addEdge(START, 'classifyIntent')
  .addConditionalEdges('classifyIntent', routeByIntent, {
    chatbot: 'chatbot',
    writeEdit: 'writeEdit',
  })
  .addEdge('chatbot', END)
  .addEdge('writeEdit', END)
