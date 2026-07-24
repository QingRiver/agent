import { z } from 'zod'
import { claudeAgentGraph } from './graphs/claudeAgent'
import { devGraph } from './graphs/dev'
import { editorChatGraph } from './graphs/editorChat'
import { kbGraph } from './graphs/kb'
import { tushareGraph } from './graphs/tushare'
import { writerGraph } from './graphs/writer'

export { claudeAgentGraph } from './graphs/claudeAgent'
export { devGraph } from './graphs/dev'
export { editorChatGraph } from './graphs/editorChat'
export {
  KB_CITATIONS_EVENT,
  kbGraph,
} from './graphs/kb'
export { tushareGraph } from './graphs/tushare'
export {
  WRITER_CHANGE_SUMMARIES_EVENT,
  type WriterChangeSummary,
  writerGraph,
} from './graphs/writer'
export { type EditorFocus, runWriteEdit, type WriteEditInput } from './nodes/writeEdit'
export {
  type AguiExtensions,
  type AguiFinalizeContext,
  type AguiMappedEvent,
  aguiRunContext,
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
export { ASK_SYSTEM_PROMPT, ASK_TOOLS } from './tools/ask-tools'
export {
  FETCH_USER_ORDER_TOOL_NAME,
  ORDER_TOOL_PROGRESS_EVENT,
} from './tools/order'

export const Graphs = {
  claudeAgent: claudeAgentGraph,
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
