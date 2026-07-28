import { z } from 'zod'
import { claudeAgentGraph } from './graphs/claudeAgent'
import { devGraph } from './graphs/dev'
import { editorChatGraph } from './graphs/editorChat'
import { kbGraph } from './graphs/kb'
import { reactAgentGraph } from './graphs/reactAgent'
import { tushareGraph } from './graphs/tushare'
import { writerGraph } from './graphs/writer'

export { claudeAgentGraph } from './graphs/claudeAgent'
export { devGraph } from './graphs/dev'
export { editorChatGraph } from './graphs/editorChat'
export {
  kbGraph,
} from './graphs/kb'
export {
  clampMaxSteps,
  composeReactAgentSystemPrompt,
  DEFAULT_REACT_AGENT_USER_PROMPT,
  KB_SEARCH_SYSTEM_PROMPT,
  REACT_AGENT_MAX_STEPS_DEFAULT,
  REACT_AGENT_MAX_STEPS_MAX,
  REACT_AGENT_MAX_STEPS_MIN,
  REACT_AGENT_USER_PROMPT_MAX,
  reactAgentGraph,
  sanitizeKbId,
  sanitizeUserPrompt,
} from './graphs/reactAgent'
export { tushareGraph } from './graphs/tushare'
export {
  WRITER_CHANGE_SUMMARIES_EVENT,
  type WriterChangeSummary,
  writerGraph,
} from './graphs/writer'
export { type EditorFocus, runWriteEdit, type WriteEditInput } from './nodes/writeEdit'
export {
  type AguiExtensions,
  type AguiMappedEvent,
  type AguiTextMessageEvent,
  type AguiToolEvent,
  AguiTransformer,
  aguiTransformerFactory,
  buildInterruptFinalizeEvents,
  INTERRUPT_REASON_CONFIRMATION,
  mapInterruptPayloadsToAgUi,
  mapInterruptPayloadToAgUi,
  mapMessagesEventDataToAgUi,
  mapToolsEventDataToAgUi,
  resolveResumeFromRunAgentInput,
} from './stream/index'
export { ASK_TOOLS } from './tools/ask-tools'
export { KB_SEARCH_TOOL_NAME, KB_TOOLS } from './tools/kb'
export {
  FETCH_USER_ORDER_TOOL_NAME,
  ORDER_TOOL_PROGRESS_EVENT,
} from './tools/order'

export const Graphs = {
  claudeAgent: claudeAgentGraph,
  reactAgent: reactAgentGraph,
  dev: devGraph,
  kb: kbGraph,
  tushare: tushareGraph,
  writer: writerGraph,
  editorChat: editorChatGraph,
} as const

export type GraphsName = keyof typeof Graphs

const graphsNameValues = Object.keys(Graphs) as GraphsName[]

export const GraphsNameSchema = z.enum(
  graphsNameValues as [GraphsName, ...GraphsName[]],
)
